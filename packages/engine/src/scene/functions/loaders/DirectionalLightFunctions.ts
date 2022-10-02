import { Color, DirectionalLight, Vector2 } from 'three'

import {
  ComponentDeserializeFunction,
  ComponentSerializeFunction,
  ComponentUpdateFunction
} from '../../../common/constants/PrefabFunctionType'
import { Entity } from '../../../ecs/classes/Entity'
import {
  addComponent,
  getComponent,
  hasComponent,
  removeComponent,
  setComponent
} from '../../../ecs/functions/ComponentFunctions'
import { EngineRenderer } from '../../../renderer/WebGLRendererSystem'
import { VisibleComponent } from '../../../scene/components/VisibleComponent'
import {
  DirectionalLightComponent,
  DirectionalLightComponentType,
  SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES
} from '../../components/DirectionalLightComponent'
import { addObjectToGroup } from '../../components/GroupComponent'

export const deserializeDirectionalLight: ComponentDeserializeFunction = (
  entity: Entity,
  data: DirectionalLightComponentType
) => {
  const props = parseDirectionalLightProperties(data)
  setComponent(entity, DirectionalLightComponent, props)
}

export const updateDirectionalLight: ComponentUpdateFunction = (entity: Entity) => {
  const component = getComponent(entity, DirectionalLightComponent)

  if (!component.light) {
    const light = (component.light = new DirectionalLight())
    light.target.position.set(0, 0, 1)
    light.target.name = 'light-target'
    light.add(light.target)
    addObjectToGroup(entity, light)
    EngineRenderer.instance.directionalLightEntities.push(entity)
  }

  const light = component.light

  light.color.set(component.color)
  light.intensity = component.intensity
  light.shadow.camera.far = component.cameraFar
  light.shadow.bias = component.shadowBias
  light.shadow.radius = component.shadowRadius
  light.castShadow = !EngineRenderer.instance.isCSMEnabled && component.castShadow

  if (!light.shadow.mapSize.equals(component.shadowMapResolution)) {
    light.shadow.mapSize.copy(component.shadowMapResolution)
    light.shadow.map?.dispose()
    light.shadow.map = null as any
    light.shadow.camera.updateProjectionMatrix()
    light.shadow.needsUpdate = true
  }

  if (component.useInCSM) {
    if (EngineRenderer.instance.activeCSMLightEntity) {
      if (EngineRenderer.instance.activeCSMLightEntity === entity) return

      const activeCSMLight = getComponent(EngineRenderer.instance.activeCSMLightEntity, DirectionalLightComponent).light
      const activeCSMLightComponent = getComponent(
        EngineRenderer.instance.activeCSMLightEntity,
        DirectionalLightComponent
      )

      activeCSMLight.castShadow = !EngineRenderer.instance.isCSMEnabled && activeCSMLightComponent.castShadow
      activeCSMLightComponent.useInCSM = false

      if (!hasComponent(EngineRenderer.instance.activeCSMLightEntity, VisibleComponent)) {
        addComponent(EngineRenderer.instance.activeCSMLightEntity, VisibleComponent, true)
      }
    }

    if (EngineRenderer.instance.csm) {
      EngineRenderer.instance.csm.changeLights(light)
      light.getWorldDirection(EngineRenderer.instance.csm.lightDirection)
    }

    EngineRenderer.instance.activeCSMLightEntity = entity

    if (hasComponent(entity, VisibleComponent)) removeComponent(entity, VisibleComponent)
  } else {
    light.castShadow = !EngineRenderer.instance.isCSMEnabled && component.castShadow
    component.useInCSM = false

    if (EngineRenderer.instance.activeCSMLightEntity === entity) EngineRenderer.instance.activeCSMLightEntity = null

    if (!hasComponent(entity, VisibleComponent)) {
      addComponent(entity, VisibleComponent, true)
    }
  }
}

export const serializeDirectionalLight: ComponentSerializeFunction = (entity) => {
  const component = getComponent(entity, DirectionalLightComponent) as DirectionalLightComponentType
  return {
    color: component.color?.getHex(),
    intensity: component.intensity,
    castShadow: component.castShadow,
    shadowMapResolution: component.shadowMapResolution?.toArray(),
    shadowBias: component.shadowBias,
    shadowRadius: component.shadowRadius,
    cameraFar: component.cameraFar,
    useInCSM: component.useInCSM
  }
}

const parseDirectionalLightProperties = (props): DirectionalLightComponentType => {
  return {
    color: new Color(props.color ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.color),
    intensity: props.intensity ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.intensity,
    castShadow: props.castShadow ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.castShadow,
    shadowBias: props.shadowBias ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.shadowBias,
    shadowRadius: props.shadowRadius ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.shadowRadius,
    shadowMapResolution: props.shadowMapResolution
      ? new Vector2().fromArray(props.shadowMapResolution)
      : new Vector2().copy(SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.shadowMapResolution),
    cameraFar: props.cameraFar ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.cameraFar,
    useInCSM: props.useInCSM ?? SCENE_COMPONENT_DIRECTIONAL_LIGHT_DEFAULT_VALUES.useInCSM
  } as DirectionalLightComponentType
}
