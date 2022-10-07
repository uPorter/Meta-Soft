import { Paginated } from '@feathersjs/feathers'
import { createState, Downgraded, useState } from '@speigg/hookstate'
// TODO: Decouple this
// import { endVideoChat, leave } from '@xrengine/engine/src/networking/functions/SocketWebRTCClientFunctions';
import axios from 'axios'
import i18n from 'i18next'
import querystring from 'querystring'
import { v1 } from 'uuid'

import { validateEmail, validatePhoneNumber } from '@xrengine/common/src/config'
import { AuthUser, AuthUserSeed, resolveAuthUser } from '@xrengine/common/src/interfaces/AuthUser'
import { AvatarInterface, AvatarProps } from '@xrengine/common/src/interfaces/AvatarInterface'
import { IdentityProvider, IdentityProviderSeed } from '@xrengine/common/src/interfaces/IdentityProvider'
import { resolveUser, resolveWalletUser, User, UserSeed, UserSetting } from '@xrengine/common/src/interfaces/User'
import { UserApiKey } from '@xrengine/common/src/interfaces/UserApiKey'
import { UserAvatar } from '@xrengine/common/src/interfaces/UserAvatar'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { WorldNetworkAction } from '@xrengine/engine/src/networking/functions/WorldNetworkAction'
import { dispatchAction } from '@xrengine/hyperflux'

import { NotificationService } from '../../common/services/NotificationService'
import { client } from '../../feathers'
import { accessLocationState } from '../../social/services/LocationService'
import { accessPartyState } from '../../social/services/PartyService'
import { store, useDispatch } from '../../store'
import { serverHost } from '../../util/config'
import { accessStoredLocalState, StoredLocalAction, StoredLocalActionType } from '../../util/StoredLocalState'
import { uploadToFeathersService } from '../../util/upload'
import { userPatched } from '../functions/userPatched'

type AuthStrategies = {
  jwt: Boolean
  local: Boolean
  facebook: Boolean
  github: Boolean
  google: Boolean
  linkedin: Boolean
  twitter: Boolean
  smsMagicLink: Boolean
  emailMagicLink: Boolean
}

//State
const state = createState({
  isLoggedIn: false,
  isProcessing: false,
  error: '',
  authUser: AuthUserSeed,
  user: UserSeed,
  identityProvider: IdentityProviderSeed,
  avatarList: [] as Array<UserAvatar>
})

export type AuthState = typeof state

export const avatarFetchedReceptor = (s: typeof state, action: ReturnType<typeof AuthAction.updateAvatarList>) => {
  const resources = action.avatarList
  const avatarData = {}
  for (let resource of resources) {
    const r = avatarData[(resource as any).name] || {}
    if (!r) {
      console.warn(i18n.t('user:avatar.warning-msg'))
      return
    }
    r[(resource as any).staticResourceType] = resource
    avatarData[(resource as any).name] = r
  }

  return s.avatarList.set(Object.keys(avatarData).map((key) => avatarData[key]))
}

store.receptors.push((action: AuthActionType | StoredLocalActionType): void => {
  state.batch((s: typeof state) => {
    switch (action.type) {
      case 'ACTION_PROCESSING':
        return s.merge({ isProcessing: action.processing, error: '' })
      case 'LOGIN_USER_SUCCESS':
        return s.merge({ authUser: action.authUser })
      case 'LOADED_USER_DATA':
        return s.merge({ isLoggedIn: true, user: action.user })
      case 'LOGIN_USER_ERROR':
        return s.merge({ error: action.message })
      case 'LOGIN_USER_BY_GITHUB_SUCCESS':
        return state
      case 'LOGIN_USER_BY_GITHUB_ERROR':
        return s.merge({ error: action.message })
      case 'LOGIN_USER_BY_LINKEDIN_SUCCESS':
        return state
      case 'LOGIN_USER_BY_LINKEDIN_ERROR':
        return s.merge({ error: action.message })
      case 'REGISTER_USER_BY_EMAIL_SUCCESS':
        return s.merge({ identityProvider: action.identityProvider })
      case 'REGISTER_USER_BY_EMAIL_ERROR':
        return state
      case 'LOGOUT_USER':
        return s.merge({ isLoggedIn: false, user: UserSeed, authUser: AuthUserSeed })
      case 'DID_VERIFY_EMAIL':
        return s.identityProvider.merge({ isVerified: action.result })
      case 'RESTORE': {
        const stored = accessStoredLocalState().attach(Downgraded).authData.value
        return s.merge({
          authUser: stored.authUser,
          identityProvider: stored.identityProvider
        })
      }
      case 'AVATAR_UPDATED': {
        return s.user.merge({ avatarUrl: action.url })
      }
      case 'USERNAME_UPDATED': {
        return s.user.merge({ name: action.name })
      }
      case 'USER_API_KEY_UPDATED': {
        return s.user.merge({ apiKey: action.apiKey })
      }
      case 'USERAVATARID_UPDATED': {
        return s.user.merge({ avatarId: action.avatarId })
      }
      case 'USER_UPDATED': {
        return s.merge({ user: action.user })
      }
      case 'USER_PATCHED': {
        return userPatched(action.params)
      }
      case 'UPDATE_USER_SETTINGS': {
        return s.user.merge({ user_setting: action.data })
      }
      case 'AVATAR_FETCHED':
        return avatarFetchedReceptor(s, action)
    }
  }, action.type)
})

export const accessAuthState = () => state
export const useAuthState = () => useState(state) as any as typeof state as typeof state

// add a listener that will be invoked on any state change.
accessAuthState().attach(() => ({
  id: Symbol('AuthPersist'),
  init: () => ({
    onSet(arg) {
      const state = accessAuthState().attach(Downgraded).value
      const dispatch = useDispatch()
      if (state.isLoggedIn)
        dispatch(
          StoredLocalAction.storedLocal({
            authData: {
              authUser: state.authUser,
              identityProvider: state.identityProvider
            }
          })
        )
    }
  })
}))

//Service
export const AuthService = {
  doLoginAuto: async (forceClientAuthReset?: boolean) => {
    const dispatch = useDispatch()
    try {
      console.log(accessStoredLocalState().attach(Downgraded))
      const authData = accessStoredLocalState().attach(Downgraded).authData.value
      let accessToken =
        forceClientAuthReset !== true && authData && authData.authUser ? authData.authUser.accessToken : undefined

      if (forceClientAuthReset === true) await (client as any).authentication.reset()
      if (accessToken == null || accessToken.length === 0) {
        const newProvider = await client.service('identity-provider').create({
          type: 'guest',
          token: v1()
        })
        accessToken = newProvider.accessToken
      }

      await (client as any).authentication.setAccessToken(accessToken as string)
      let res
      try {
        res = await (client as any).reAuthenticate()
      } catch (err) {
        if (err.className === 'not-found' || (err.className === 'not-authenticated' && err.message === 'jwt expired')) {
          await dispatch(AuthAction.didLogout())
          await (client as any).authentication.reset()
          const newProvider = await client.service('identity-provider').create({
            type: 'guest',
            token: v1()
          })
          accessToken = newProvider.accessToken
          await (client as any).authentication.setAccessToken(accessToken as string)
          res = await (client as any).reAuthenticate()
        } else {
          throw err
        }
      }
      if (res) {
        if (res['identity-provider']?.id == null) {
          await dispatch(AuthAction.didLogout())
          await (client as any).authentication.reset()
          const newProvider = await client.service('identity-provider').create({
            type: 'guest',
            token: v1()
          })
          accessToken = newProvider.accessToken
          await (client as any).authentication.setAccessToken(accessToken as string)
          res = await (client as any).reAuthenticate()
        }
        const authUser = resolveAuthUser(res)
        dispatch(AuthAction.loginUserSuccess(authUser))
        await AuthService.loadUserData(authUser.identityProvider.userId)
      } else {
        console.log('****************')
      }
    } catch (err) {
      console.error(err)
      dispatch(AuthAction.didLogout())

      // if (window.location.pathname !== '/') {
      //   window.location.href = '/';
      // }
    }
  },
  loadUserData: (userId: string): any => {
    return client
      .service('user')
      .get(userId)
      .then((res: any) => {
        if (res.user_setting == null) {
          return client
            .service('user-settings')
            .find({
              query: {
                userId: userId
              }
            })
            .then((settingsRes: Paginated<UserSetting>) => {
              if (settingsRes.total === 0) {
                return client
                  .service('user-settings')
                  .create({
                    userId: userId
                  })
                  .then((newSettings) => {
                    res.user_setting = newSettings

                    return Promise.resolve(res)
                  })
              }
              res.user_setting = settingsRes.data[0]
              return Promise.resolve(res)
            })
        }
        return Promise.resolve(res)
      })
      .then((res: any) => {
        const dispatch = useDispatch()
        const user = resolveUser(res)
        dispatch(AuthAction.loadedUserData(user))
      })
      .catch((err: any) => {
        NotificationService.dispatchNotify(i18n.t('common:error.loading-error'), { variant: 'error' })
      })
  },
  loginUserByPassword: async (form: EmailLoginForm) => {
    const dispatch = useDispatch()

    // check email validation.
    if (!validateEmail(form.email)) {
      NotificationService.dispatchNotify(i18n.t('common:error.validation-error', { type: 'email address' }), {
        variant: 'error'
      })

      return
    }

    dispatch(AuthAction.actionProcessing(true))
    ;(client as any)
      .authenticate({
        strategy: 'local',
        email: form.email,
        password: form.password
      })
      .then((res: any) => {
        const authUser = resolveAuthUser(res)

        if (!authUser.identityProvider.isVerified) {
          ;(client as any).logout()

          dispatch(AuthAction.registerUserByEmailSuccess(authUser.identityProvider))
          window.location.href = '/auth/confirm'
          return
        }

        dispatch(AuthAction.loginUserSuccess(authUser))
        AuthService.loadUserData(authUser.identityProvider.userId).then(() => (window.location.href = '/'))
      })
      .catch((err: any) => {
        dispatch(AuthAction.loginUserError(i18n.t('common:error.login-error')))
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  loginUserByXRWallet: async (wallet: any) => {
    const dispatch = useDispatch()

    try {
      dispatch(AuthAction.actionProcessing(true))

      const credentials: any = parseUserWalletCredentials(wallet)
      console.log(credentials)

      const walletUser = resolveWalletUser(credentials)

      //TODO: This is temp until we move completely to XR wallet
      const oldId = accessAuthState().user.id.value
      walletUser.id = oldId

      // loadXRAvatarForUpdatedUser(walletUser) // TODO
      dispatch(AuthAction.loadedUserData(walletUser))
    } catch (err) {
      dispatch(AuthAction.loginUserError(i18n.t('common:error.login-error')))
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    } finally {
      dispatch(AuthAction.actionProcessing(false))
    }
  },
  loginUserByOAuth: async (service: string, location: any) => {
    const dispatch = useDispatch()
    dispatch(AuthAction.actionProcessing(true))
    const token = accessAuthState().authUser.accessToken.value
    const path = location?.state?.from || location.pathname
    const queryString = querystring.parse(window.location.search.slice(1))
    const redirectObject = {
      path: path
    } as any
    if (queryString.instanceId && queryString.instanceId.length > 0) redirectObject.instanceId = queryString.instanceId
    window.location.href = `${serverHost}/oauth/${service}?feathers_token=${token}&redirect=${JSON.stringify(
      redirectObject
    )}`
  },
  loginUserByJwt: async (accessToken: string, redirectSuccess: string, redirectError: string) => {
    const dispatch = useDispatch()

    try {
      dispatch(AuthAction.actionProcessing(true))
      await (client as any).authentication.setAccessToken(accessToken as string)
      const res = await (client as any).authenticate({
        strategy: 'jwt',
        accessToken
      })

      const authUser = resolveAuthUser(res)

      dispatch(AuthAction.loginUserSuccess(authUser))
      await AuthService.loadUserData(authUser.identityProvider.userId)
      dispatch(AuthAction.actionProcessing(false))
      window.location.href = redirectSuccess
    } catch (err) {
      dispatch(AuthAction.loginUserError(i18n.t('common:error.login-error')))
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
      window.location.href = `${redirectError}?error=${err.message}`
      dispatch(AuthAction.actionProcessing(false))
    }
  },
  loginUserMagicLink: async (token, redirectSuccess, redirectError) => {
    try {
      const res = await client.service('login').get(token)
      await AuthService.loginUserByJwt(res.token, '/', '/')
    } catch (err) {
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    } finally {
      window.location.href = redirectSuccess
    }
  },
  logoutUser: async () => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))
    ;(client as any)
      .logout()
      .then(() => dispatch(AuthAction.didLogout()))
      .catch(() => dispatch(AuthAction.didLogout()))
      .finally(() => {
        dispatch(AuthAction.actionProcessing(false))
        AuthService.doLoginAuto(true)
      })
  },
  registerUserByEmail: (form: EmailRegistrationForm) => {
    const dispatch = useDispatch()
    dispatch(AuthAction.actionProcessing(true))
    client
      .service('identity-provider')
      .create({
        token: form.email,
        password: form.password,
        type: 'password'
      })
      .then((identityProvider: any) => {
        console.log('3 ', identityProvider)
        dispatch(AuthAction.registerUserByEmailSuccess(identityProvider))
        window.location.href = '/auth/confirm'
      })
      .catch((err: any) => {
        console.log('error', err)
        dispatch(AuthAction.registerUserByEmailError(err.message))
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => {
        console.log('4 finally', dispatch)
        dispatch(AuthAction.actionProcessing(false))
      })
  },
  verifyEmail: async (token: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    client
      .service('authManagement')
      .create({
        action: 'verifySignupLong',
        value: token
      })
      .then((res: any) => {
        dispatch(AuthAction.didVerifyEmail(true))
        AuthService.loginUserByJwt(res.accessToken, '/', '/')
      })
      .catch((err: any) => {
        dispatch(AuthAction.didVerifyEmail(false))
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  resendVerificationEmail: async (email: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    client
      .service('authManagement')
      .create({
        action: 'resendVerifySignup',
        value: {
          token: email,
          type: 'password'
        }
      })
      .then(() => dispatch(AuthAction.didResendVerificationEmail(true)))
      .catch(() => dispatch(AuthAction.didResendVerificationEmail(false)))
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  forgotPassword: async (email: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))
    console.log('forgotPassword', email)
    client
      .service('authManagement')
      .create({
        action: 'sendResetPwd',
        value: {
          token: email,
          type: 'password'
        }
      })
      .then(() => dispatch(AuthAction.didForgotPassword(true)))
      .catch(() => dispatch(AuthAction.didForgotPassword(false)))
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  resetPassword: async (token: string, password: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    client
      .service('authManagement')
      .create({
        action: 'resetPwdLong',
        value: { token, password }
      })
      .then((res: any) => {
        console.log(res)
        dispatch(AuthAction.didResetPassword(true))
        window.location.href = '/'
      })
      .catch((err: any) => {
        dispatch(AuthAction.didResetPassword(false))
        window.location.href = '/'
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  createMagicLink: async (emailPhone: string, authState: AuthStrategies, linkType?: 'email' | 'sms') => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    let type = 'email'
    let paramName = 'email'
    const enableEmailMagicLink = authState?.emailMagicLink
    const enableSmsMagicLink = authState?.smsMagicLink

    if (linkType === 'email') {
      type = 'email'
      paramName = 'email'
    } else if (linkType === 'sms') {
      type = 'sms'
      paramName = 'mobile'
    } else {
      const stripped = emailPhone.replace(/-/g, '')
      if (validatePhoneNumber(stripped)) {
        if (!enableSmsMagicLink) {
          NotificationService.dispatchNotify(i18n.t('common:error.validation-error', { type: 'email address' }), {
            variant: 'error'
          })

          return
        }
        type = 'sms'
        paramName = 'mobile'
        emailPhone = '+1' + stripped
      } else if (validateEmail(emailPhone)) {
        if (!enableEmailMagicLink) {
          NotificationService.dispatchNotify(i18n.t('common:error.validation-error', { type: 'phone number' }), {
            variant: 'error'
          })

          return
        }
        type = 'email'
      } else {
        NotificationService.dispatchNotify(i18n.t('common:error.validation-error', { type: 'email or phone number' }), {
          variant: 'error'
        })

        return
      }
    }

    client
      .service('magic-link')
      .create({
        type,
        [paramName]: emailPhone
      })
      .then((res: any) => {
        console.log(res)
        dispatch(AuthAction.didCreateMagicLink(true))
        NotificationService.dispatchNotify(i18n.t('user:auth.magiklink.success-msg'), { variant: 'success' })
      })
      .catch((err: any) => {
        dispatch(AuthAction.didCreateMagicLink(false))
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  addConnectionByPassword: async (form: EmailLoginForm, userId: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    client
      .service('identity-provider')
      .create({
        token: form.email,
        password: form.password,
        type: 'password',
        userId
      })
      .then((res: any) => {
        const identityProvider = res as IdentityProvider
        return AuthService.loadUserData(identityProvider.userId)
      })
      .catch((err: any) => {
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  addConnectionByEmail: async (email: string, userId: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))
    client
      .service('magic-link')
      .create({
        email,
        type: 'email',
        userId
      })
      .then((res: any) => {
        const identityProvider = res as IdentityProvider
        if (identityProvider.userId != null) {
          NotificationService.dispatchNotify(i18n.t('user:auth.magiklink.email-sent-msg'), { variant: 'success' })
          return AuthService.loadUserData(identityProvider.userId)
        }
      })
      .catch((err: any) => {
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  addConnectionBySms: async (phone: string, userId: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    let sendPhone = phone.replace(/-/g, '')
    if (sendPhone.length === 10) {
      sendPhone = '1' + sendPhone
    }

    client
      .service('magic-link')
      .create({
        mobile: sendPhone,
        type: 'sms',
        userId
      })
      .then((res: any) => {
        const identityProvider = res as IdentityProvider
        if (identityProvider.userId != null) {
          NotificationService.dispatchNotify(i18n.t('user:auth.magiklink.sms-sent-msg'), { variant: 'error' })
          return AuthService.loadUserData(identityProvider.userId)
        }
      })
      .catch((err: any) => {
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  addConnectionByOauth: async (
    oauth: 'facebook' | 'google' | 'github' | 'linkedin' | 'twitter' | 'discord',
    userId: string
  ) => {
    window.open(`https://${globalThis.process.env['VITE_SERVER_HOST']}/auth/oauth/${oauth}?userId=${userId}`, '_blank')
  },
  removeConnection: async (identityProviderId: number, userId: string) => {
    const dispatch = useDispatch()

    dispatch(AuthAction.actionProcessing(true))

    client
      .service('identity-provider')
      .remove(identityProviderId)
      .then(() => {
        return AuthService.loadUserData(userId)
      })
      .catch((err: any) => {
        NotificationService.dispatchNotify(err.message, { variant: 'error' })
      })
      .finally(() => dispatch(AuthAction.actionProcessing(false)))
  },
  refreshConnections: (userId: string) => {
    AuthService.loadUserData(userId)
  },
  updateUserSettings: async (id: any, data: any) => {
    const dispatch = useDispatch()
    const res = (await client.service('user-settings').patch(id, data)) as UserSetting
    console.log('/////////////////////////////////////////', res)
    dispatch(AuthAction.updatedUserSettingsAction(res))
  },
  uploadAvatar: async (data: any) => {
    const dispatch = useDispatch()

    const token = accessAuthState().authUser.accessToken.value
    const selfUser = accessAuthState().user
    const res = await axios.post(`https://${globalThis.process.env['VITE_SERVER_HOST']}/upload`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: 'Bearer ' + token
      }
    })
    const userId = selfUser.id.value ?? null
    await client.service('user').patch(userId, {
      name: selfUser.name.value
    })
    const result = res.data
    NotificationService.dispatchNotify('Avatar updated', { variant: 'success' })
    dispatch(AuthAction.avatarUpdated(result))
  },
  uploadAvatarModel: async (avatar: Blob, thumbnail: Blob, avatarName: string, isPublicAvatar?: boolean) => {
    await uploadToFeathersService('upload-asset', [avatar, thumbnail], {
      type: 'user-avatar-upload',
      args: {
        avatarName,
        isPublicAvatar: !!isPublicAvatar
      }
    })
    const avatarDetail = (await client.service('avatar').get(avatarName)) as AvatarProps
    if (!isPublicAvatar) {
      const selfUser = accessAuthState().user
      const userId = selfUser.id.value!
      AuthService.updateUserAvatarId(userId, avatarName, avatarDetail.avatarURL, avatarDetail.thumbnailURL!)
    }
  },
  removeAvatar: async (keys: string) => {
    const dispatch = useDispatch()

    await client
      .service('avatar')
      .remove('', {
        query: { keys }
      })
      .then((_) => {
        NotificationService.dispatchNotify(i18n.t('user:avatar.remove-success-msg'), { variant: 'success' })
        AuthService.fetchAvatarList()
      })
  },
  fetchAvatarList: async () => {
    const selfUser = accessAuthState().user
    const dispatch = useDispatch()

    const result = await client.service('static-resource').find({
      query: {
        $select: ['id', 'key', 'name', 'url', 'staticResourceType', 'userId'],
        staticResourceType: {
          $in: ['avatar', 'user-thumbnail']
        },
        $or: [{ userId: selfUser.id.value }, { userId: null }],
        $limit: 1000
      }
    })
    dispatch(AuthAction.updateAvatarList(result.data))
  },
  updateUsername: async (userId: string, name: string) => {
    const dispatch = useDispatch()

    client
      .service('user')
      .patch(userId, {
        name: name
      })
      .then((res: any) => {
        NotificationService.dispatchNotify(i18n.t('user:usermenu.profile.update-msg'), { variant: 'success' })
        dispatch(AuthAction.usernameUpdated(res))
      })
  },
  updateUserAvatarId: async (userId: string, avatarId: string, avatarURL: string, thumbnailURL: string) => {
    const world = Engine.instance.currentWorld
    const dispatch = useDispatch()

    client
      .service('user')
      .patch(userId, {
        avatarId: avatarId
      })
      .then((res: any) => {
        // dispatchAlertSuccess(dispatch, 'User Avatar updated');
        dispatch(AuthAction.userAvatarIdUpdated(res.avatarId))
        dispatchAction(
          WorldNetworkAction.avatarDetails({
            avatarDetail: {
              avatarURL,
              thumbnailURL
            }
          }),
          [Engine.instance.currentWorld.worldNetwork.hostId]
        )
      })
  },
  removeUser: async (userId: string) => {
    await client.service('user').remove(userId)
    await client.service('identity-provider').remove(null, {
      query: {
        userId: userId
      }
    })
    AuthService.logoutUser()
  },

  updateApiKey: async () => {
    const dispatch = useDispatch()
    const apiKey = (await client.service('user-api-key').patch(null, {})) as UserApiKey
    dispatch(AuthAction.apiKeyUpdated(apiKey))
  },
  listenForUserPatch: () => {
    client.service('user').on('patched', (params) => useDispatch()(AuthAction.userPatched(params)))
    client.service('location-ban').on('created', async (params) => {
      const selfUser = accessAuthState().user
      const party = accessPartyState().party.value
      const selfPartyUser =
        party && party.partyUsers
          ? party.partyUsers.find((partyUser) => partyUser.id === selfUser.id.value)
          : ({} as any)
      const currentLocation = accessLocationState().currentLocation.location
      const locationBan = params.locationBan
      if (selfUser.id.value === locationBan.userId && currentLocation.id.value === locationBan.locationId) {
        // TODO: Decouple and reenable me!
        // endVideoChat({ leftParty: true });
        // leave(true);
        if (selfPartyUser != undefined && selfPartyUser?.id != null) {
          await client.service('party-user').remove(selfPartyUser.id)
        }
        const userId = selfUser.id.value ?? ''
        const user = resolveUser(await client.service('user').get(userId))
        store.dispatch(AuthAction.userUpdated(user))
      }
    })
  }
}

const parseUserWalletCredentials = (wallet) => {
  return {
    user: {
      id: 'did:web:example.com',
      displayName: 'alice',
      icon: 'https://material-ui.com/static/images/avatar/1.jpg'
      // session // this will contain the access token and helper methods
    }
  }
}

// Action
export interface EmailLoginForm {
  email: string
  password: string
}

export interface EmailRegistrationForm {
  email: string
  password: string
}

export interface GithubLoginForm {
  email: string
}

export interface LinkedInLoginForm {
  email: string
}

export const AuthAction = {
  actionProcessing: (processing: boolean) => {
    return {
      type: 'ACTION_PROCESSING' as const,
      processing
    }
  },
  loginUserSuccess: (authUser: AuthUser) => {
    return {
      type: 'LOGIN_USER_SUCCESS' as const,
      authUser,
      message: ''
    }
  },
  loginUserError: (err: string) => {
    return {
      type: 'LOGIN_USER_ERROR' as const,
      message: err
    }
  },
  loginUserByGithubSuccess: (message: string) => {
    return {
      type: 'LOGIN_USER_BY_GITHUB_SUCCESS' as const,
      message
    }
  },
  loginUserByGithubError: (message: string) => {
    return {
      type: 'LOGIN_USER_BY_GITHUB_ERROR' as const,
      message
    }
  },
  loginUserByLinkedinSuccess: (message: string) => {
    return {
      type: 'LOGIN_USER_BY_LINKEDIN_SUCCESS' as const,
      message
    }
  },
  loginUserByLinkedinError: (message: string) => {
    return {
      type: 'LOGIN_USER_BY_LINKEDIN_ERROR' as const,
      message
    }
  },
  didLogout: () => {
    return {
      type: 'LOGOUT_USER' as const,
      message: ''
    }
  },
  registerUserByEmailSuccess: (identityProvider: IdentityProvider) => {
    return {
      type: 'REGISTER_USER_BY_EMAIL_SUCCESS' as const,
      identityProvider,
      message: ''
    }
  },
  registerUserByEmailError: (message: string) => {
    return {
      type: 'REGISTER_USER_BY_EMAIL_ERROR' as const,
      message: message
    }
  },
  didVerifyEmail: (result: boolean) => {
    return {
      type: 'DID_VERIFY_EMAIL' as const,
      result
    }
  },
  didResendVerificationEmail: (result: boolean) => {
    return {
      type: 'DID_RESEND_VERIFICATION_EMAIL' as const,
      result
    }
  },
  didForgotPassword: (result: boolean) => {
    return {
      type: 'DID_FORGOT_PASSWORD' as const,
      result
    }
  },
  didResetPassword: (result: boolean) => {
    return {
      type: 'DID_RESET_PASSWORD' as const,
      result
    }
  },
  didCreateMagicLink: (result: boolean) => {
    return {
      type: 'DID_CREATE_MAGICLINK' as const,
      result
    }
  },
  loadedUserData: (user: User) => {
    return {
      type: 'LOADED_USER_DATA' as const,
      user
    }
  },
  updatedUserSettingsAction: (data: UserSetting) => {
    return {
      type: 'UPDATE_USER_SETTINGS' as const,
      data: data
    }
  },
  avatarUpdated: (result: any) => {
    const url = result.url
    return {
      type: 'AVATAR_UPDATED' as const,
      url
    }
  },
  usernameUpdated: (result: User) => {
    const name = result.name
    return {
      type: 'USERNAME_UPDATED' as const,
      name
    }
  },
  userAvatarIdUpdated: (avatarId: string) => {
    return {
      type: 'USERAVATARID_UPDATED' as const,
      avatarId
    }
  },
  userPatched: (params: any) => {
    return {
      type: 'USER_PATCHED' as const,
      params
    }
  },
  userUpdated: (user: User) => {
    return {
      type: 'USER_UPDATED' as const,
      user: user
    }
  },
  updateAvatarList: (avatarList: AvatarInterface[]) => {
    return {
      type: 'AVATAR_FETCHED' as const,
      avatarList
    }
  },
  apiKeyUpdated: (apiKey: UserApiKey) => {
    return {
      type: 'USER_API_KEY_UPDATED' as const,
      apiKey: apiKey
    }
  }
}

export type AuthActionType = ReturnType<typeof AuthAction[keyof typeof AuthAction]>