import { getEntityComponents } from 'bitecs'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import JSONTree from 'react-json-tree'

import { mapToObject } from '@xrengine/common/src/utils/mapToObject'
import { AvatarControllerComponent } from '@xrengine/engine/src/avatar/components/AvatarControllerComponent'
import { respawnAvatar } from '@xrengine/engine/src/avatar/functions/respawnAvatar'
import { Engine } from '@xrengine/engine/src/ecs/classes/Engine'
import { EngineActions, EngineState } from '@xrengine/engine/src/ecs/classes/EngineState'
import { Component, getComponent, hasComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import {
  accessEngineRendererState,
  EngineRendererAction,
  useEngineRendererState
} from '@xrengine/engine/src/renderer/EngineRendererState'
import { NameComponent } from '@xrengine/engine/src/scene/components/NameComponent'
import { ObjectLayers } from '@xrengine/engine/src/scene/constants/ObjectLayers'
import { dispatchAction, getState, useHookstate } from '@xrengine/hyperflux'

import BlurOffIcon from '@mui/icons-material/BlurOff'
import GridOnIcon from '@mui/icons-material/GridOn'
import Refresh from '@mui/icons-material/Refresh'
import SelectAllIcon from '@mui/icons-material/SelectAll'
import SquareFootIcon from '@mui/icons-material/SquareFoot'

import { StatsPanel } from './StatsPanel'
import styles from './styles.module.scss'

export const Debug = () => {
  // This is here to force the debug view to update ECS data on every frame
  useHookstate(() => getState(EngineState).frameTime).value

  const [isShowing, setShowing] = useState(false)
  const showingStateRef = useRef(isShowing)
  const engineRendererState = useEngineRendererState()
  const engineState = useHookstate(getState(EngineState))
  const { t } = useTranslation()
  const hasActiveControlledAvatar =
    engineState.joinedWorld.value &&
    hasComponent(Engine.instance.currentWorld.localClientEntity, AvatarControllerComponent)

  const networks = mapToObject(Engine.instance.currentWorld.networks)

  // Add event listeners
  useEffect(() => {
    // If pressed key is our target key then set to true
    function downHandler({ keyCode }) {
      if (keyCode === 192) {
        // `
        showingStateRef.current = !showingStateRef.current
        setShowing(showingStateRef.current)
      }
    }
    window.addEventListener('keydown', downHandler)
    return () => {
      window.removeEventListener('keydown', downHandler)
    }
  }, [])

  const onClickRespawn = (): void => {
    respawnAvatar(Engine.instance.currentWorld.localClientEntity)
  }

  const toggleDebug = () => {
    dispatchAction(EngineRendererAction.setDebug({ debugEnable: !engineRendererState.debugEnable.value }))
  }

  const renderAllEntities = () => {
    return {
      ...Object.fromEntries(
        [...Engine.instance.currentWorld.entityQuery().entries()]
          .map(([key, eid]) => {
            const name = getComponent(eid, NameComponent)?.name
            try {
              return [
                '(eid:' +
                  eid +
                  ') ' +
                  (name ?? Engine.instance.currentWorld.entityTree.entityNodeMap.get(eid)?.uuid ?? ''),
                Object.fromEntries(
                  getEntityComponents(Engine.instance.currentWorld, eid).reduce<[string, any][]>(
                    (components, C: Component<any, any>) => {
                      if (C !== NameComponent) {
                        const component = getComponent(eid, C)
                        components.push([C._name, { ...component }])
                      }
                      return components
                    },
                    []
                  )
                )
              ]
            } catch (e) {
              return null!
            }
          })
          .filter((exists) => !!exists)
      )
    }
  }

  const toggleNodeHelpers = () => {
    Engine.instance.currentWorld.camera.layers.toggle(ObjectLayers.NodeHelper)
    dispatchAction(
      EngineRendererAction.changeNodeHelperVisibility({
        visibility: !accessEngineRendererState().nodeHelperVisibility.value
      })
    )
  }

  const toggleGridHelper = () => {
    Engine.instance.currentWorld.camera.layers.toggle(ObjectLayers.Gizmos)
    dispatchAction(
      EngineRendererAction.changeGridToolVisibility({ visibility: !accessEngineRendererState().gridVisibility.value })
    )
  }

  const namedEntities = useHookstate({})

  const pipelines = Engine.instance.currentWorld.pipelines

  if (isShowing) {
    namedEntities.set(renderAllEntities())
    return (
      <div className={styles.debugContainer}>
        <div className={styles.debugOptionContainer}>
          <h1>{t('common:debug.debugOptions')}</h1>
          <div className={styles.optionBlock}>
            <div className={styles.flagContainer}>
              <button
                type="button"
                onClick={toggleDebug}
                className={styles.flagBtn + (engineRendererState.debugEnable.value ? ' ' + styles.active : '')}
                title={t('common:debug.debug')}
              >
                <SquareFootIcon fontSize="small" />
              </button>
              <button
                type="button"
                onClick={toggleNodeHelpers}
                className={styles.flagBtn + (engineRendererState.nodeHelperVisibility.value ? ' ' + styles.active : '')}
                title={t('common:debug.nodeHelperDebug')}
              >
                <SelectAllIcon fontSize="small" />
              </button>
              <button
                type="button"
                onClick={toggleGridHelper}
                className={styles.flagBtn + (engineRendererState.gridVisibility.value ? ' ' + styles.active : '')}
                title={t('common:debug.gridDebug')}
              >
                <GridOnIcon fontSize="small" />
              </button>
              {hasActiveControlledAvatar && (
                <button type="button" className={styles.flagBtn} id="respawn" onClick={onClickRespawn}>
                  <Refresh />
                </button>
              )}
            </div>
          </div>
        </div>
        <StatsPanel show={showingStateRef.current} />
        <div className={styles.jsonPanel}>
          <h1>{t('common:debug.systems')}</h1>
          <JSONTree
            data={pipelines}
            postprocessValue={(v) => {
              if (!v?.name) return v
              const s = new String(v?.name) as any
              s.instance = v
              return s
            }} // yes, all this is a hack. We probably shouldn't use JSONTree for this
            valueRenderer={(raw, value: any) => (
              <>
                <input
                  type="checkbox"
                  checked={value?.instance?.enabled}
                  onChange={() => (value.instance.enabled = !value.instance.enabled)}
                ></input>{' '}
                — {value}
              </>
            )}
            shouldExpandNode={(keyPath, data, level) => level > 0}
          />
        </div>
        <div className={styles.jsonPanel}>
          <h1>{t('common:debug.state')}</h1>
          <JSONTree data={Engine.instance.store.state} postprocessValue={(v) => v?.value ?? v} />
        </div>
        <div className={styles.jsonPanel}>
          <h1>{t('common:debug.entities')}</h1>
          <JSONTree data={namedEntities.value} postprocessValue={(v) => v?.value ?? v} />
        </div>
        <div className={styles.jsonPanel}>
          <h1>{t('common:debug.networks')}</h1>
          <JSONTree data={{ ...networks }} />
        </div>
      </div>
    )
  } else return null
}

export default Debug
