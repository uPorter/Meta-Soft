import { Paginated } from '@feathersjs/feathers'
import { createState, useState } from '@speigg/hookstate'

import { Instance } from '@xrengine/common/src/interfaces/Instance'
import { InstanceServerProvisionResult } from '@xrengine/common/src/interfaces/InstanceServerProvisionResult'
import { UserId } from '@xrengine/common/src/interfaces/UserId'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { EngineActions } from '@xrengine/engine/src/ecs/classes/EngineState'
import { Network } from '@xrengine/engine/src/networking/classes/Network'
import { dispatchAction } from '@xrengine/hyperflux'

import { client } from '../../feathers'
import { accessLocationState } from '../../social/services/LocationService'
import { store, useDispatch } from '../../store'
import { leave } from '../../transports/SocketWebRTCClientFunctions'
import { SocketWebRTCClientTransport } from '../../transports/SocketWebRTCClientTransport'
import { accessAuthState } from '../../user/services/AuthService'

type InstanceState = {
  ipAddress: string
  port: string
  locationId: string
  sceneId: string
  provisioned: boolean
  connected: boolean
  readyToConnect: boolean
  updateNeeded: boolean
  connecting: boolean
}

//State
const state = createState({
  instances: {} as { [id: string]: InstanceState },
  currentInstanceId: null as string | null
})

store.receptors.push((action: LocationInstanceConnectionActionType): any => {
  state.batch((s) => {
    switch (action.type) {
      case 'LOCATION_INSTANCE_SERVER_PROVISIONED':
        s.currentInstanceId.set(action.instanceId)
        return s.instances[action.instanceId].set({
          ipAddress: action.ipAddress,
          port: action.port,
          locationId: action.locationId!,
          sceneId: action.sceneId!,
          provisioned: true,
          readyToConnect: true,
          updateNeeded: true,
          connected: false,
          connecting: false
        })
      case 'LOCATION_INSTANCE_SERVER_CONNECTING':
        return s.instances[action.instanceId].connecting.set(true)
      case 'LOCATION_INSTANCE_SERVER_CONNECTED':
        return s.instances[action.instanceId].merge({
          connected: true,
          connecting: false,
          updateNeeded: false,
          readyToConnect: false
        })
      case 'LOCATION_INSTANCE_SERVER_DISCONNECT':
        return s.instances[action.instanceId].set(undefined!)
    }
  }, action.type)
})

export const accessLocationInstanceConnectionState = () => state

export const useLocationInstanceConnectionState = () => useState(state) as any as typeof state

//Service
export const LocationInstanceConnectionService = {
  provisionServer: async (locationId?: string, instanceId?: string, sceneId?: string) => {
    console.log('Provision World Server', locationId, instanceId, sceneId)
    const dispatch = useDispatch()
    const token = accessAuthState().authUser.accessToken.value
    if (instanceId != null) {
      const instance = (await client.service('instance').find({
        query: {
          id: instanceId,
          ended: false
        }
      })) as Paginated<Instance>
      if (instance.total === 0) {
        instanceId = null!
      }
    }
    const provisionResult = await client.service('instance-provision').find({
      query: {
        locationId: locationId,
        instanceId: instanceId,
        sceneId: sceneId,
        token: token
      }
    })
    if (provisionResult.ipAddress && provisionResult.port) {
      dispatch(LocationInstanceConnectionAction.serverProvisioned(provisionResult, locationId!, sceneId!))
    } else {
      dispatchAction(
        Engine.instance.store,
        SocketWebRTCClientTransport.actions.noWorldServersAvailable({ instanceId: instanceId! })
      )
    }
  },
  connectToServer: async (instanceId: string) => {
    const dispatch = useDispatch()
    dispatch(LocationInstanceConnectionAction.connecting(instanceId))
    const transport = Network.instance.getTransport('world' as UserId) as SocketWebRTCClientTransport
    console.log('Connect To World Server', !!transport.socket, transport)
    if (transport.socket) {
      await leave(transport, false)
    }
    const locationState = accessLocationState()
    const currentLocation = locationState.currentLocation.location
    const sceneId = currentLocation?.sceneId?.value

    const { ipAddress, port } = accessLocationInstanceConnectionState().instances.value[instanceId]

    try {
      await transport.initialize({ sceneId, port, ipAddress, instanceId, locationId: currentLocation.id.value })
      transport.left = false

      const authState = accessAuthState()
      const user = authState.user.value
      dispatchAction(Engine.instance.store, EngineActions.connect({ id: user.id! }))
    } catch (error) {
      console.error('Network transport could not initialize, transport is: ', transport)
    }
  }
}

client.service('instance-provision').on('created', (params) => {
  if (params.locationId != null)
    store.dispatch(LocationInstanceConnectionAction.serverProvisioned(params, params.locationId, params.sceneId))
})

//Action

export const LocationInstanceConnectionAction = {
  serverProvisioned: (
    provisionResult: InstanceServerProvisionResult,
    locationId: string | null,
    sceneId: string | null
  ) => {
    return {
      type: 'LOCATION_INSTANCE_SERVER_PROVISIONED' as const,
      instanceId: provisionResult.id,
      ipAddress: provisionResult.ipAddress,
      port: provisionResult.port,
      locationId: locationId,
      sceneId: sceneId
    }
  },
  connecting: (instanceId: string) => {
    return {
      type: 'LOCATION_INSTANCE_SERVER_CONNECTING' as const,
      instanceId
    }
  },
  instanceServerConnected: (instanceId: string) => {
    return {
      type: 'LOCATION_INSTANCE_SERVER_CONNECTED' as const,
      instanceId
    }
  },
  disconnect: (instanceId: string) => {
    return {
      type: 'LOCATION_INSTANCE_SERVER_DISCONNECT' as const,
      instanceId
    }
  }
}

export type LocationInstanceConnectionActionType = ReturnType<
  typeof LocationInstanceConnectionAction[keyof typeof LocationInstanceConnectionAction]
>
