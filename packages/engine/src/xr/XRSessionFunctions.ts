import { createHookableFunction } from '@xrengine/common/src/utils/createMutableFunction'
import { dispatchAction, getState } from '@xrengine/hyperflux'

import { AvatarHeadDecapComponent } from '../avatar/components/AvatarHeadDecapComponent'
import { FollowCameraComponent } from '../camera/components/FollowCameraComponent'
import { TouchInputs } from '../input/enums/InputEnums'
import { SkyboxComponent } from '../scene/components/SkyboxComponent'
import { updateSkybox } from '../scene/functions/loaders/SkyboxFunctions'
import { BinaryValue } from './../common/enums/BinaryValue'
import { LifecycleValue } from './../common/enums/LifecycleValue'
import { matches } from './../common/functions/MatchesUtils'
import { Engine } from './../ecs/classes/Engine'
import { addComponent, defineQuery, getComponent, hasComponent } from './../ecs/functions/ComponentFunctions'
import { removeComponent } from './../ecs/functions/ComponentFunctions'
import { InputType } from './../input/enums/InputType'
import { EngineRenderer } from './../renderer/WebGLRendererSystem'
import { XRHandsInputComponent, XRInputSourceComponent } from './XRComponents'
import { cleanXRInputs } from './XRControllerFunctions'
import { XREstimatedLight } from './XREstimatedLight'
import { setupXRInputSourceComponent } from './XRFunctions'
import { getControlMode, XRAction, XRState } from './XRState'

const skyboxQuery = defineQuery([SkyboxComponent])

/**
 * A hookable function that is fired when the XR Session is requested
 * @returns
 */
export const requestXRSession = createHookableFunction(
  async (action: typeof XRAction.requestSession.matches._TYPE): Promise<void> => {
    const xrState = getState(XRState)
    const xrManager = EngineRenderer.instance.xrManager

    if (xrState.requestingSession.value) return
    try {
      const sessionInit = {
        optionalFeatures: [
          'local-floor',
          'hand-tracking',
          'layers',
          'dom-overlay',
          'hit-test',
          'light-estimation',
          'depth-sensing',
          'anchors'
        ],
        depthSensing: {
          usagePreference: ['cpu-optimized', 'gpu-optimized'],
          dataFormatPreference: ['luminance-alpha', 'float32']
        },
        domOverlay: { root: document.body }
      } as XRSessionInit
      const mode =
        action.mode ||
        (xrState.supportedSessionModes['immersive-ar'].value
          ? 'immersive-ar'
          : xrState.supportedSessionModes['immersive-vr'].value
          ? 'immersive-vr'
          : 'inline')

      xrState.requestingSession.set(true)
      const xrSession = (EngineRenderer.instance.xrSession = await navigator.xr!.requestSession(mode, sessionInit))

      // @ts-ignore
      if (xrSession.interactionMode === 'screen-space') {
        xrManager.setFramebufferScaleFactor(0.5)
      }

      await xrManager.setSession(xrSession)

      xrState.sessionActive.set(true)

      const referenceSpace = xrManager.getReferenceSpace()
      xrState.originReferenceSpace.set(referenceSpace)

      xrManager.setFoveation(1)
      xrState.sessionMode.set(mode)

      const world = Engine.instance.currentWorld

      if (mode === 'immersive-ar') setupARSession(world)
      if (mode === 'immersive-vr') setupVRSession(world)

      const prevFollowCamera = getComponent(world.cameraEntity, FollowCameraComponent)
      removeComponent(world.cameraEntity, FollowCameraComponent)

      const onSessionEnd = () => {
        xrState.sessionActive.set(false)
        xrState.sessionMode.set('none')
        xrManager.removeEventListener('sessionend', onSessionEnd)
        xrManager.setSession(null!)
        EngineRenderer.instance.xrSession = null!
        const world = Engine.instance.currentWorld
        addComponent(world.cameraEntity, FollowCameraComponent, prevFollowCamera)
        EngineRenderer.instance.renderer.domElement.style.display = ''

        xrState.originReferenceSpace.set(null)
        xrState.viewerReferenceSpace.set(null)

        if (hasComponent(world.localClientEntity, XRInputSourceComponent)) {
          cleanXRInputs(world.localClientEntity)
          removeComponent(world.localClientEntity, XRInputSourceComponent)
        }
        if (hasComponent(world.localClientEntity, XRHandsInputComponent))
          removeComponent(world.localClientEntity, XRHandsInputComponent)
        const skybox = skyboxQuery()[0]
        if (skybox) updateSkybox(skybox)
        dispatchAction(XRAction.sessionChanged({ active: false }))
      }
      xrManager.addEventListener('sessionend', onSessionEnd)

      dispatchAction(XRAction.sessionChanged({ active: true }))
    } catch (e) {
      console.error('Failed to create XR Session', e)
    }

    xrState.requestingSession.set(false)
  }
)

/**
 * A hookable function that is fired when the XR Session has ended
 * @returns
 */
export const endXRSession = createHookableFunction(async () => {
  await EngineRenderer.instance.xrSession?.end()
})

/**
 * A hookable function that is fired when the XR Session has changed
 * @returns
 */
export const xrSessionChanged = createHookableFunction((action: typeof XRAction.sessionChanged.matches._TYPE) => {
  const entity = Engine.instance.currentWorld.getUserAvatarEntity(action.$from)
  if (!entity) return

  if (action.active) {
    if (getControlMode() === 'attached') {
      if (!hasComponent(entity, AvatarHeadDecapComponent)) addComponent(entity, AvatarHeadDecapComponent, true)
      if (!hasComponent(entity, XRInputSourceComponent)) setupXRInputSourceComponent(entity)
    }
  } else if (hasComponent(entity, XRInputSourceComponent)) {
    cleanXRInputs(entity)
    removeComponent(entity, XRInputSourceComponent)
  }
})

export const setupVRSession = (world = Engine.instance.currentWorld) => {
  setupXRInputSourceComponent(world.localClientEntity)
}

export const setupARSession = (world = Engine.instance.currentWorld) => {
  EngineRenderer.instance.renderer.domElement.style.display = 'none'

  /**
   * AR uses the `select` event as taps on the screen for mobile AR sessions
   * This gets piped into the input system as a TouchInput.Touch
   */
  EngineRenderer.instance.xrSession.addEventListener('selectstart', () => {
    Engine.instance.currentWorld.inputState.set(TouchInputs.Touch, {
      type: InputType.BUTTON,
      value: [BinaryValue.ON],
      lifecycleState: LifecycleValue.Started
    })
  })
  EngineRenderer.instance.xrSession.addEventListener('selectend', (inputSource) => {
    Engine.instance.currentWorld.inputState.set(TouchInputs.Touch, {
      type: InputType.BUTTON,
      value: [BinaryValue.OFF],
      lifecycleState: LifecycleValue.Ended
    })
  })

  setupWebXRLightprobe()

  world.scene.background = null
}

/**
 * https://github.com/mrdoob/three.js/blob/master/examples/webxr_ar_lighting.html
 */
export const setupWebXRLightprobe = () => {
  const xrLight = new XREstimatedLight(EngineRenderer.instance.renderer)

  let previousEnvironment = Engine.instance.currentWorld.scene.environment

  xrLight.addEventListener('estimationstart', () => {
    // Swap the default light out for the estimated one one we start getting some estimated values.
    Engine.instance.currentWorld.scene.add(xrLight)

    // The estimated lighting also provides an environment cubemap, which we can apply here.
    if (xrLight.environment) {
      previousEnvironment = Engine.instance.currentWorld.scene.environment
      Engine.instance.currentWorld.scene.environment = xrLight.environment
    }
  })

  xrLight.addEventListener('estimationend', () => {
    Engine.instance.currentWorld.scene.remove(xrLight)
    Engine.instance.currentWorld.scene.environment = previousEnvironment
  })
}
