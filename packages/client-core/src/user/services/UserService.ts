import { Paginated } from '@feathersjs/feathers'
import { none } from '@hookstate/core'

import { UserInterface } from '@xrengine/common/src/interfaces/User'
import { matches, Validator } from '@xrengine/engine/src/common/functions/MatchesUtils'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { defineAction, defineState, dispatchAction, getState, useState } from '@xrengine/hyperflux'

import { API } from '../../API'

//State
const UserState = defineState({
  name: 'UserState',
  initial: () => ({
    users: [] as Array<UserInterface>,
    updateNeeded: true,
    layerUsers: [] as Array<UserInterface>,
    layerUsersUpdateNeeded: true,
    channelLayerUsers: [] as Array<UserInterface>,
    channelLayerUsersUpdateNeeded: true
  })
})

export const UserServiceReceptor = (action) => {
  const s = getState(UserState)
  matches(action)
    .when(UserAction.clearLayerUsersAction.matches, () => {
      return s.merge({ layerUsers: [], layerUsersUpdateNeeded: true })
    })
    .when(UserAction.loadedLayerUsersAction.matches, (action) => {
      return s.merge({ layerUsers: action.users, layerUsersUpdateNeeded: false })
    })
    .when(UserAction.addedLayerUserAction.matches, (action) => {
      const index = s.layerUsers.findIndex((layerUser) => {
        return layerUser != null && layerUser.id.value === action.user.id
      })
      if (index === -1) {
        return s.layerUsers.merge([action.user])
      } else {
        return s.layerUsers[index].set(action.user)
      }
    })
    .when(UserAction.removedLayerUserAction.matches, (action) => {
      const layerUsers = s.layerUsers
      const index = layerUsers.findIndex((layerUser) => {
        return layerUser != null && layerUser.value.id === action.user.id
      })
      return s.layerUsers[index].set(none)
    })
    .when(UserAction.clearChannelLayerUsersAction.matches, () => {
      return s.merge({
        channelLayerUsers: [],
        channelLayerUsersUpdateNeeded: true
      })
    })
    .when(UserAction.loadedChannelLayerUsersAction.matches, (action) => {
      return s.merge({
        channelLayerUsers: action.users,
        channelLayerUsersUpdateNeeded: false
      })
    })
    .when(UserAction.addedChannelLayerUserAction.matches, (action) => {
      const index = s.channelLayerUsers.findIndex((layerUser) => {
        return layerUser != null && layerUser.value.id === action.user.id
      })
      if (index === -1) {
        return s.channelLayerUsers.merge([action.user])
      } else {
        return s.channelLayerUsers[index].set(action.user)
      }
    })
    .when(UserAction.removedChannelLayerUserAction.matches, (action) => {
      if (action.user) {
        const index = s.channelLayerUsers.findIndex((layerUser) => {
          return layerUser != null && layerUser.value.id === action.user.id
        })
        return s.channelLayerUsers[index].set(none)
      } else return s
    })
}

export const accessUserState = () => getState(UserState)
export const useUserState = () => useState(accessUserState())

//Service
export const UserService = {
  getLayerUsers: async (instance: boolean) => {
    let query = {
      $limit: 1000,
      action: instance ? 'layer-users' : 'channel-users'
    } as any
    if (!instance) query.channelInstanceId = Engine.instance.currentWorld._mediaHostId
    else query.instanceId = Engine.instance.currentWorld._worldHostId
    const layerUsers = (await API.instance.client.service('user').find({
      query: query
    })) as Paginated<UserInterface>

    const state = getState(UserState)

    if (
      JSON.stringify(instance ? state.layerUsers.value : state.channelLayerUsers.value) !==
      JSON.stringify(layerUsers.data)
    ) {
      dispatchAction(
        instance
          ? UserAction.loadedLayerUsersAction({ users: layerUsers.data })
          : UserAction.loadedChannelLayerUsersAction({ users: layerUsers.data })
      )
    }
  }
}

//Action
export class UserAction {
  static loadedLayerUsersAction = defineAction({
    type: 'xre.client.User.LOADED_LAYER_USERS' as const,
    users: matches.array as Validator<unknown, UserInterface[]>
  })

  static clearLayerUsersAction = defineAction({
    type: 'xre.client.User.CLEAR_LAYER_USERS' as const
  })

  static addedLayerUserAction = defineAction({
    type: 'xre.client.User.ADDED_LAYER_USER' as const,
    user: matches.object as Validator<unknown, UserInterface>
  })

  static removedLayerUserAction = defineAction({
    type: 'xre.client.User.REMOVED_LAYER_USER' as const,
    user: matches.object as Validator<unknown, UserInterface>
  })

  static loadedChannelLayerUsersAction = defineAction({
    type: 'xre.client.User.LOADED_CHANNEL_LAYER_USERS' as const,
    users: matches.array as Validator<unknown, UserInterface[]>
  })

  static clearChannelLayerUsersAction = defineAction({
    type: 'xre.client.User.CLEAR_CHANNEL_LAYER_USERS' as const
  })

  static addedChannelLayerUserAction = defineAction({
    type: 'xre.client.User.ADDED_CHANNEL_LAYER_USER' as const,
    user: matches.object as Validator<unknown, UserInterface>
  })

  static removedChannelLayerUserAction = defineAction({
    type: 'xre.client.User.REMOVED_CHANNEL_LAYER_USER' as const,
    user: matches.object as Validator<unknown, UserInterface>
  })
}
