import React, { useEffect } from 'react'
import { useHistory } from 'react-router'

import {
  LocationInstanceConnectionService,
  useLocationInstanceConnectionState
} from '@xrengine/client-core/src/common/services/LocationInstanceConnectionService'
import {
  MediaInstanceConnectionService,
  useMediaInstanceConnectionState
} from '@xrengine/client-core/src/common/services/MediaInstanceConnectionService'
import { MediaServiceReceptor, MediaStreamService } from '@xrengine/client-core/src/media/services/MediaStreamService'
import { ChatAction, ChatService, useChatState } from '@xrengine/client-core/src/social/services/ChatService'
import { useLocationState } from '@xrengine/client-core/src/social/services/LocationService'
import { MediaStreams } from '@xrengine/client-core/src/transports/MediaStreams'
import { useAuthState } from '@xrengine/client-core/src/user/services/AuthService'
import {
  NetworkUserService,
  NetworkUserServiceReceptor,
  useNetworkUserState
} from '@xrengine/client-core/src/user/services/NetworkUserService'
import { matches } from '@xrengine/engine/src/common/functions/MatchesUtils'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { useEngineState } from '@xrengine/engine/src/ecs/classes/EngineState'
import {
  addActionReceptor,
  dispatchAction,
  getState,
  removeActionReceptor,
  useHookEffect,
  useHookstate
} from '@xrengine/hyperflux'

import { AppState } from '../../common/services/AppService'
import { PartyService, usePartyState } from '../../social/services/PartyService'
import InstanceServerWarnings from './InstanceServerWarnings'

export const NetworkInstanceProvisioning = () => {
  const authState = useAuthState()
  const selfUser = authState.user
  const userState = useNetworkUserState()
  const chatState = useChatState()
  const locationState = useLocationState()
  const isUserBanned = locationState.currentLocation.selfUserBanned.value
  const engineState = useEngineState()
  const history = useHistory()
  const partyState = usePartyState()

  const appState = useHookstate(getState(AppState))
  const showTopShelf = appState.showTopShelf.value
  const showBottomShelf = appState.showTopShelf.value

  const worldNetworkHostId = Engine.instance.currentWorld.worldNetwork?.hostId
  const instanceConnectionState = useLocationInstanceConnectionState()
  const currentLocationInstanceConnection = instanceConnectionState.instances[worldNetworkHostId!].ornull

  const mediaNetworkHostId = Engine.instance.currentWorld.mediaNetwork?.hostId
  const channelConnectionState = useMediaInstanceConnectionState()
  const currentChannelInstanceConnection = channelConnectionState.instances[mediaNetworkHostId!].ornull

  MediaInstanceConnectionService.useAPIListeners()

  useEffect(() => {
    addActionReceptor(MediaServiceReceptor)
    addActionReceptor((action) => {
      matches(action).when(
        MediaStreams.actions.triggerUpdateConsumers.matches,
        MediaStreamService.triggerUpdateConsumers
      )
    })
    addActionReceptor(NetworkUserServiceReceptor)
    return () => {
      removeActionReceptor(MediaServiceReceptor)
      removeActionReceptor(NetworkUserServiceReceptor)
    }
  }, [])

  /** if the instance that got provisioned is not the one that was entered into the URL, update the URL */
  useHookEffect(() => {
    if (worldNetworkHostId) {
      const url = new URL(window.location.href)
      const searchParams = url.searchParams
      const instanceId = searchParams.get('instanceId')
      if (instanceId !== worldNetworkHostId) searchParams.set('instanceId', worldNetworkHostId)
      history.push(url.pathname + url.search)
    }
  }, [currentLocationInstanceConnection])

  // 2. once we have the location, provision the instance server
  useHookEffect(() => {
    const currentLocation = locationState.currentLocation.location
    const isProvisioned = worldNetworkHostId && currentLocationInstanceConnection?.provisioned.value

    if (currentLocation.id?.value) {
      if (!isUserBanned && !isProvisioned) {
        const search = window.location.search
        let instanceId

        if (search != null) {
          instanceId = new URL(window.location.href).searchParams.get('instanceId')
        }

        LocationInstanceConnectionService.provisionServer(
          currentLocation.id.value,
          instanceId || undefined,
          currentLocation.sceneId.value
        )
      }
    }
  }, [locationState.currentLocation.location])

  // 3. once engine is initialised and the server is provisioned, connect the the instance server
  useHookEffect(() => {
    if (
      engineState.sceneLoaded.value &&
      currentLocationInstanceConnection?.value &&
      currentLocationInstanceConnection.provisioned.value === true &&
      currentLocationInstanceConnection.readyToConnect.value === true &&
      currentLocationInstanceConnection.connecting.value === false &&
      currentLocationInstanceConnection.connected.value === false
    )
      LocationInstanceConnectionService.connectToServer(worldNetworkHostId)
  }, [
    engineState.sceneLoaded,
    currentLocationInstanceConnection?.connected,
    currentLocationInstanceConnection?.readyToConnect,
    currentLocationInstanceConnection?.provisioned,
    currentLocationInstanceConnection?.connecting
  ])

  // media server provisioning
  useHookEffect(() => {
    if (chatState.instanceChannelFetched.value) {
      const channels = chatState.channels.channels.value
      const instanceChannel = Object.values(channels).find((channel) => channel.instanceId === worldNetworkHostId)
      if (!currentChannelInstanceConnection?.provisioned.value)
        MediaInstanceConnectionService.provisionServer(instanceChannel?.id!, true)
    }
  }, [chatState.instanceChannelFetched])

  useHookEffect(() => {
    if (selfUser?.instanceId.value != null && userState.layerUsersUpdateNeeded.value)
      NetworkUserService.getLayerUsers(true)
  }, [selfUser?.instanceId, userState.layerUsersUpdateNeeded])

  useHookEffect(() => {
    if (selfUser?.channelInstanceId.value != null && userState.channelLayerUsersUpdateNeeded.value)
      NetworkUserService.getLayerUsers(false)
  }, [selfUser?.channelInstanceId, userState.channelLayerUsersUpdateNeeded])

  useHookEffect(() => {
    if (selfUser?.partyId?.value && chatState.channels.channels?.value) {
      const partyChannel = Object.values(chatState.channels.channels.value).find(
        (channel) => channel.channelType === 'party' && channel.partyId === selfUser.partyId.value
      )
      const partyUser = partyState.party?.partyUsers?.value
        ? partyState.party.partyUsers.value.find((partyUser) => partyUser.userId === selfUser.id.value)
        : null
      if (
        chatState.partyChannelFetched?.value &&
        partyChannel &&
        currentChannelInstanceConnection?.channelId.value !== partyChannel.id &&
        partyUser
      )
        MediaInstanceConnectionService.provisionServer(partyChannel?.id!, false)
      else if (!chatState.partyChannelFetched.value && !chatState.partyChannelFetching.value)
        ChatService.getPartyChannel()
    }
  }, [
    selfUser?.partyId?.value,
    partyState.party?.id,
    chatState.channels.channels.value as any,
    chatState.partyChannelFetching?.value,
    chatState.partyChannelFetched?.value
  ])

  useHookEffect(() => {
    if (selfUser.partyId.value) dispatchAction(ChatAction.refetchPartyChannelAction({}))
  }, [selfUser.partyId.value])

  useHookEffect(() => {
    if (partyState.updateNeeded.value) PartyService.getParty()
  }, [partyState.updateNeeded.value])

  // if a media connection has been provisioned and is ready, connect to it
  useHookEffect(() => {
    if (
      mediaNetworkHostId &&
      currentChannelInstanceConnection?.value &&
      currentChannelInstanceConnection.provisioned.value === true &&
      currentChannelInstanceConnection.readyToConnect.value === true &&
      currentChannelInstanceConnection.connecting.value === false &&
      currentChannelInstanceConnection.connected.value === false
    ) {
      MediaInstanceConnectionService.connectToServer(
        mediaNetworkHostId,
        currentChannelInstanceConnection.channelId.value
      )
      MediaStreamService.updateCamVideoState()
      MediaStreamService.updateCamAudioState()
      MediaStreamService.updateScreenAudioState()
      MediaStreamService.updateScreenVideoState()
    }
  }, [
    currentChannelInstanceConnection?.connected,
    currentChannelInstanceConnection?.readyToConnect,
    currentChannelInstanceConnection?.provisioned,
    currentChannelInstanceConnection?.connecting
  ])

  return <InstanceServerWarnings />
}

export default NetworkInstanceProvisioning
