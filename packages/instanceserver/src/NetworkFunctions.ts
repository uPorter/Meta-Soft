import { DataConsumer, DataProducer } from 'mediasoup/node/lib/types'
import { Socket } from 'socket.io'

import { Instance } from '@xrengine/common/src/interfaces/Instance'
import { UserInterface } from '@xrengine/common/src/interfaces/User'
import { UserId } from '@xrengine/common/src/interfaces/UserId'
import { SpawnPoseComponent } from '@xrengine/engine/src/avatar/components/SpawnPoseComponent'
import { respawnAvatar } from '@xrengine/engine/src/avatar/functions/respawnAvatar'
import checkPositionIsValid from '@xrengine/engine/src/common/functions/checkPositionIsValid'
import { performance } from '@xrengine/engine/src/common/functions/performance'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { getComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { MessageTypes } from '@xrengine/engine/src/networking/enums/MessageTypes'
import { NetworkPeerFunctions } from '@xrengine/engine/src/networking/functions/NetworkPeerFunctions'
import { JoinWorldProps, JoinWorldRequestData } from '@xrengine/engine/src/networking/functions/receiveJoinWorld'
import { AvatarProps, WorldState } from '@xrengine/engine/src/networking/interfaces/WorldState'
import { Object3DComponent } from '@xrengine/engine/src/scene/components/Object3DComponent'
import { TransformComponent } from '@xrengine/engine/src/transform/components/TransformComponent'
import { dispatchAction, getState } from '@xrengine/hyperflux'
import { Action } from '@xrengine/hyperflux/functions/ActionFunctions'
import { Application } from '@xrengine/server-core/declarations'
import config from '@xrengine/server-core/src/appconfig'
import { localConfig } from '@xrengine/server-core/src/config'
import multiLogger from '@xrengine/server-core/src/ServerLogger'
import getLocalServerIp from '@xrengine/server-core/src/util/get-local-server-ip'

import { SocketWebRTCServerNetwork } from './SocketWebRTCServerNetwork'
import { closeTransport } from './WebRTCFunctions'

const logger = multiLogger.child({ component: 'instanceserver:network' })
const isNameRegex = /instanceserver-([a-zA-Z0-9]{5}-[a-zA-Z0-9]{5})/

export const setupSubdomain = async (network: SocketWebRTCServerNetwork) => {
  const app = network.app
  let stringSubdomainNumber: string

  if (config.kubernetes.enabled) {
    await cleanupOldInstanceservers(network)
    app.instanceServer = await app.agonesSDK.getGameServer()

    // We used to provision subdomains for instanceservers, e.g. 00001.instanceserver.domain.com
    // This turned out to be unnecessary, and in fact broke Firefox's ability to connect via
    // UDP, so the following was commented out.
    // const name = app.instanceServer.objectMeta.name
    // const isIdentifier = isNameRegex.exec(name)!
    // stringSubdomainNumber = await getFreeSubdomain(transport, isIdentifier[1], 0)
    // app.isSubdomainNumber = stringSubdomainNumber
    //
    // const Route53 = new AWS.Route53({ ...config.aws.route53.keys })
    // const params = {
    //   ChangeBatch: {
    //     Changes: [
    //       {
    //         Action: 'UPSERT',
    //         ResourceRecordSet: {
    //           Name: `${stringSubdomainNumber}.${config.instanceserver.domain}`,
    //           ResourceRecords: [{ Value: app.instanceserver.status.address }],
    //           TTL: 0,
    //           Type: 'A'
    //         }
    //       }
    //     ]
    //   },
    //   HostedZoneId: config.aws.route53.hostedZoneId
    // }
    // if (config.instanceserver.local !== true) await Route53.changeResourceRecordSets(params as any).promise()
  }

  // Set up our instanceserver according to our current environment
  const localIp = await getLocalServerIp(app.isChannelInstance)
  const announcedIp = config.kubernetes.enabled ? app.instanceServer.status.address : localIp.ipAddress

  localConfig.mediasoup.webRtcTransport.listenIps = [
    {
      ip: '0.0.0.0',
      announcedIp
    }
  ]
}

export async function getFreeSubdomain(
  network: SocketWebRTCServerNetwork,
  isIdentifier: string,
  subdomainNumber: number
): Promise<string> {
  const stringSubdomainNumber = subdomainNumber.toString().padStart(config.instanceserver.identifierDigits, '0')
  const subdomainResult = await network.app.service('instanceserver-subdomain-provision').find({
    query: {
      is_number: stringSubdomainNumber
    }
  })
  if ((subdomainResult as any).total === 0) {
    await network.app.service('instanceserver-subdomain-provision').create({
      allocated: true,
      is_number: stringSubdomainNumber,
      is_id: isIdentifier
    })

    await new Promise((resolve) =>
      setTimeout(async () => {
        resolve(true)
      }, 500)
    )

    const newSubdomainResult = (await network.app.service('instanceserver-subdomain-provision').find({
      query: {
        is_number: stringSubdomainNumber
      }
    })) as any
    if (newSubdomainResult.total > 0 && newSubdomainResult.data[0].gs_id === isIdentifier) return stringSubdomainNumber
    else return getFreeSubdomain(network, isIdentifier, subdomainNumber + 1)
  } else {
    const subdomain = (subdomainResult as any).data[0]
    if (subdomain.allocated === true || subdomain.allocated === 1) {
      return getFreeSubdomain(network, isIdentifier, subdomainNumber + 1)
    }
    await network.app.service('instanceserver-subdomain-provision').patch(subdomain.id, {
      allocated: true,
      is_id: isIdentifier
    })

    await new Promise((resolve) =>
      setTimeout(async () => {
        resolve(true)
      }, 500)
    )

    const newSubdomainResult = (await network.app.service('instanceserver-subdomain-provision').find({
      query: {
        is_number: stringSubdomainNumber
      }
    })) as any
    if (newSubdomainResult.total > 0 && newSubdomainResult.data[0].gs_id === isIdentifier) return stringSubdomainNumber
    else return getFreeSubdomain(network, isIdentifier, subdomainNumber + 1)
  }
}

export async function cleanupOldInstanceservers(network: SocketWebRTCServerNetwork): Promise<void> {
  const instances = await network.app.service('instance').Model.findAndCountAll({
    offset: 0,
    limit: 1000,
    where: {
      ended: false
    }
  })
  const instanceservers = await network.app.k8AgonesClient.listNamespacedCustomObject(
    'agones.dev',
    'v1',
    'default',
    'gameservers'
  )

  await Promise.all(
    instances.rows.map((instance) => {
      if (!instance.ipAddress) return false
      const [ip, port] = instance.ipAddress.split(':')
      const match = (instanceservers?.body! as any).items.find((is) => {
        if (is.status.ports == null || is.status.address === '') return false
        const inputPort = is.status.ports.find((port) => port.name === 'default')
        return is.status.address === ip && inputPort.port.toString() === port
      })
      return match == null
        ? network.app.service('instance').patch(instance.id, {
            ended: true
          })
        : Promise.resolve()
    })
  )

  const isIds = (instanceservers?.body! as any).items.map((is) =>
    isNameRegex.exec(is.metadata.name) != null ? isNameRegex.exec(is.metadata.name)![1] : null
  )

  await network.app.service('instanceserver-subdomain-provision').patch(
    null,
    {
      allocated: false
    },
    {
      query: {
        is_id: {
          $nin: isIds
        }
      }
    }
  )

  return
}

/**
 * Returns true if a user has permission to access a specific instance
 * @param app
 * @param instance
 * @param userId
 * @returns
 */
export const authorizeUserToJoinServer = async (app: Application, instance: Instance, userId: UserId) => {
  const authorizedUsers = (await app.service('instance-authorized-user').find({
    query: {
      instanceId: instance.id,
      $limit: 0
    }
  })) as any
  if (authorizedUsers.total > 0) {
    const thisUserAuthorized = (await app.service('instance-authorized-user').find({
      query: {
        instanceId: instance.id,
        userId,
        $limit: 0
      }
    })) as any
    if (thisUserAuthorized.total === 0) {
      logger.info(`User "${userId}" not authorized to be on this server.`)
      return false
    }
  }
  return true
}

export function getUserIdFromSocketId(network: SocketWebRTCServerNetwork, socketId: string) {
  const client = Array.from(network.peers.values()).find((c) => c.socketId === socketId)
  return client?.userId
}

export const handleConnectingPeer = async (network: SocketWebRTCServerNetwork, socket: Socket, user: UserInterface) => {
  const userId = user.id
  const avatarDetail = await network.app.service('avatar').get(user.avatarId!)

  // Create a new client object
  // and add to the dictionary
  const userIndex = network.userIndexCount++
  network.peers.set(userId, {
    userId,
    index: userIndex,
    socket: socket,
    socketId: socket.id,
    lastSeenTs: Date.now(),
    joinTs: Date.now(),
    media: {},
    consumerLayers: {},
    stats: {},
    dataConsumers: new Map<string, DataConsumer>(), // Key => id of data producer
    dataProducers: new Map<string, DataProducer>() // Key => label of data channel
  })

  const worldState = getState(WorldState)
  worldState.userNames[userId].set(user.name)
  worldState.userAvatarDetails[userId].set({
    avatarURL: avatarDetail.modelResource?.url || '',
    thumbnailURL: avatarDetail.thumbnailResource?.url || ''
  })

  network.userIdToUserIndex.set(userId, userIndex)
  network.userIndexToUserId.set(userIndex, userId)

  const spectating = network.peers.get(userId)!.spectating

  network.app.service('message').create(
    {
      targetObjectId: network.app.instance.id,
      targetObjectType: 'instance',
      text: `${user.name} joined` + (spectating ? ' as spectator' : ''),
      isNotification: true
    },
    {
      'identity-provider': {
        userId: userId
      }
    }
  )
}

export async function handleJoinWorld(
  network: SocketWebRTCServerNetwork,
  socket: Socket,
  data: JoinWorldRequestData,
  callback: Function,
  userId: UserId,
  user: UserInterface
) {
  logger.info('Connect to world from ' + userId)

  const world = Engine.instance.currentWorld

  const cachedActions = NetworkPeerFunctions.getCachedActionsForUser(network, userId)

  network.updatePeers()

  callback({
    routerRtpCapabilities: network.routers.instance[0].rtpCapabilities,
    highResTimeOrigin: performance.timeOrigin,
    worldStartTime: world.startTime,
    cachedActions
  })

  if (data.inviteCode && !network.app.isChannelInstance) await getUserSpawnFromInvite(network, user, data.inviteCode!)
}

export function disconnectClientIfConnected(network: SocketWebRTCServerNetwork, socket: Socket, userId: UserId) {
  // If we are already logged in, kick the other socket
  const client = network.peers.get(userId)
  if (client) {
    if (client.socketId === socket.id) {
      logger.info('Client already logged in, disallowing new connection')
      return true
    }

    // kick old client instead of new one
    logger.info('Client already exists, kicking the old client and disconnecting')
    client.socket?.emit(MessageTypes.Kick.toString(), 'You joined this world on another device')
    client.socket?.disconnect()
    handleDisconnect(network, client.socket!)

    // return true anyway, new client will send another connect to world request which will pass
    return true
  }
}

const getUserSpawnFromInvite = async (
  network: SocketWebRTCServerNetwork,
  user: UserInterface,
  inviteCode: string,
  iteration = 0
) => {
  const world = Engine.instance.currentWorld

  if (inviteCode) {
    const result = (await network.app.service('user').find({
      query: {
        action: 'invite-code-lookup',
        inviteCode: inviteCode
      }
    })) as any

    const users = result.data as UserInterface[]
    if (users.length > 0) {
      const inviterUser = users[0]
      if (inviterUser.instanceId === user.instanceId) {
        const selfAvatarEntity = world.getUserAvatarEntity(user.id as UserId)
        if (!selfAvatarEntity) {
          if (iteration >= 100) {
            logger.warn(
              `User ${user.id} did not spawn their avatar within 5 seconds, abandoning attempts to spawn at inviter`
            )
            return
          }
          return setTimeout(() => getUserSpawnFromInvite(network, user, inviteCode, iteration + 1), 50)
        }
        const inviterUserId = inviterUser.id
        const inviterUserAvatarEntity = world.getUserAvatarEntity(inviterUserId as UserId)
        if (!inviterUserAvatarEntity) {
          if (iteration >= 100) {
            logger.warn(
              `inviting user ${inviterUserId} did not have a spawned avatar within 5 seconds, abandoning attempts to spawn at inviter`
            )
            return
          }
          return setTimeout(() => getUserSpawnFromInvite(network, user, inviteCode, iteration + 1), 50)
        }
        const inviterUserTransform = getComponent(inviterUserAvatarEntity, TransformComponent)

        /** @todo find nearest valid spawn position, rather than 2 in front */
        const inviterUserObject3d = getComponent(inviterUserAvatarEntity, Object3DComponent)
        // Translate infront of the inviter
        inviterUserObject3d.value.translateZ(2)

        const validSpawnablePosition = checkPositionIsValid(inviterUserObject3d.value.position, false)

        if (validSpawnablePosition) {
          const spawnPoseComponent = getComponent(selfAvatarEntity, SpawnPoseComponent)
          spawnPoseComponent?.position.copy(inviterUserObject3d.value.position)
          spawnPoseComponent?.rotation.copy(inviterUserTransform.rotation)
          respawnAvatar(selfAvatarEntity)
        }
      } else {
        logger.warn('The user who invited this user in no longer on this instance.')
      }
    }
  }
}

export function handleIncomingActions(network: SocketWebRTCServerNetwork, socket: Socket, message) {
  if (!message) return

  const userIdMap = {} as { [socketId: string]: UserId }
  for (const [id, client] of network.peers) userIdMap[client.socketId!] = id
  if (!userIdMap[socket.id])
    throw new Error('Received actions from a peer that does not exist: ' + JSON.stringify(message))

  const actions = /*decode(new Uint8Array(*/ message /*))*/ as Required<Action>[]
  for (const a of actions) {
    a['$fromSocketId'] = socket.id
    a.$from = userIdMap[socket.id]
    dispatchAction(a)
  }
  // logger.info('SERVER INCOMING ACTIONS: %s', JSON.stringify(actions))
}

export async function handleHeartbeat(network: SocketWebRTCServerNetwork, socket: Socket): Promise<any> {
  const userId = getUserIdFromSocketId(network, socket.id)!
  // logger.info('Got heartbeat from user ' + userId + ' at ' + Date.now())
  if (network.peers.has(userId)) network.peers.get(userId)!.lastSeenTs = Date.now()
}

export async function handleDisconnect(network: SocketWebRTCServerNetwork, socket: Socket): Promise<any> {
  const userId = getUserIdFromSocketId(network, socket.id) as UserId
  const disconnectedClient = network.peers.get(userId)
  if (!disconnectedClient)
    return logger.warn(
      'Disconnecting client ' + userId + ' was undefined, probably already handled from JoinWorld handshake.'
    )
  // On local, new connections can come in before the old sockets are disconnected.
  // The new connection will overwrite the socketID for the user's client.
  // This will only clear transports if the client's socketId matches the socket that's disconnecting.
  if (socket.id === disconnectedClient?.socketId) {
    const state = getState(WorldState)
    const userName = state.userNames[userId].value

    network.app.service('message').create(
      {
        targetObjectId: network.app.instance.id,
        targetObjectType: 'instance',
        text: `${userName} left`,
        isNotification: true
      },
      {
        'identity-provider': {
          userId: userId
        }
      }
    )

    NetworkPeerFunctions.destroyPeer(network, userId, Engine.instance.currentWorld)
    network.updatePeers()
    logger.info('Disconnecting clients for user ' + userId)
    if (disconnectedClient?.instanceRecvTransport) disconnectedClient.instanceRecvTransport.close()
    if (disconnectedClient?.instanceSendTransport) disconnectedClient.instanceSendTransport.close()
    if (disconnectedClient?.channelRecvTransport) disconnectedClient.channelRecvTransport.close()
    if (disconnectedClient?.channelSendTransport) disconnectedClient.channelSendTransport.close()
  } else {
    logger.warn("Socket didn't match for disconnecting client.")
  }
}

export async function handleLeaveWorld(
  network: SocketWebRTCServerNetwork,
  socket: Socket,
  data,
  callback
): Promise<any> {
  const userId = getUserIdFromSocketId(network, socket.id)!
  for (const [, transport] of Object.entries(network.mediasoupTransports))
    if ((transport as any).appData.peerId === userId) closeTransport(network, transport)
  if (network.peers.has(userId)) {
    NetworkPeerFunctions.destroyPeer(network, userId, Engine.instance.currentWorld)
    network.updatePeers()
  }
  if (callback !== undefined) callback({})
}
