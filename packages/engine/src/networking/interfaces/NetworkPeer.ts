import type SocketIO from 'socket.io'

import { NetworkId } from '@xrengine/common/src/interfaces/NetworkId'
import { UserId } from '@xrengine/common/src/interfaces/UserId'

export interface NetworkPeer {
  userId: UserId
  index: number
  spectating?: boolean
  networkId?: NetworkId // to easily retrieve the network object correspending to this client
  // The following properties are only present on the server
  socket?: SocketIO.Socket
  socketId?: string
  lastSeenTs?: any
  joinTs?: any
  media?: {}
  consumerLayers?: {}
  stats?: {}
  instanceSendTransport?: any
  instanceRecvTransport?: any
  channelSendTransport?: any
  channelRecvTransport?: any
  dataConsumers?: Map<string, any> // Key => id of data producer
  dataProducers?: Map<string, any> // Key => label of data channel}
}

export interface UserClient {
  userId: UserId
  name: string
}
