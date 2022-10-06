import React, { Suspense, useEffect, useState } from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'

import UIDialog from '@xrengine/client-core/src/common/components/Dialog'
import UserMenu from '@xrengine/client-core/src/user/components/UserMenu'
import { AudioEffectPlayer } from '@xrengine/engine/src/audio/systems/MediaSystem'
import { isTouchAvailable } from '@xrengine/engine/src/common/functions/DetectFeatures'
import { EngineState } from '@xrengine/engine/src/ecs/classes/EngineState'
import { getState, useHookstate } from '@xrengine/hyperflux'

import { Close, FullscreenExit, ZoomOutMap } from '@mui/icons-material'
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown'
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp'
import { Tooltip } from '@mui/material'

import { LoadingSystemState } from '../../systems/state/LoadingState'
import ConferenceMode from '../ConferenceMode'
import Debug from '../Debug'
import InstanceChat from '../InstanceChat'
import InviteToast from '../InviteToast'
import MediaIconsBox from '../MediaIconsBox'
import { useFullscreen } from '../useFullscreen'
import UserMediaWindows from '../UserMediaWindows'
import styles from './index.module.scss'

const TouchGamepad = React.lazy(() => import('@xrengine/client-core/src/common/components/TouchGamepad'))

interface Props {
  useLoadingScreenOpacity?: boolean
  pageTitle: string
  children?: JSX.Element | JSX.Element[]
  hideVideo?: boolean
  hideFullscreen?: boolean
}

const Layout = ({ useLoadingScreenOpacity, pageTitle, children, hideVideo, hideFullscreen }: Props): any => {
  const engineState = useHookstate(getState(EngineState))
  const [fullScreenActive, setFullScreenActive] = useFullscreen()
  const [showMediaIcons, setShowMediaIcons] = useState(true)
  const [showBottomIcons, setShowBottomIcons] = useState(true)
  const loadingSystemState = useHookstate(getState(LoadingSystemState))
  const [showTouchPad, setShowTouchPad] = useState(true)
  const [conferenceMode, setConferenceMode] = useState(false)

  const { t } = useTranslation()

  useEffect(() => {
    const topButtonsState = localStorage.getItem('isTopButtonsShown')
    const bottomButtonsState = localStorage.getItem('isBottomButtonsShown')
    if (!topButtonsState) {
      localStorage.setItem('isTopButtonsShown', 'true')
    } else {
      setShowMediaIcons(JSON.parse(topButtonsState))
    }
    if (!bottomButtonsState) {
      localStorage.setItem('isBottomButtonsShown', 'true')
    } else {
      setShowBottomIcons(JSON.parse(bottomButtonsState))
    }
  }, [])

  const iOS = (): boolean => {
    return (
      ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(navigator.platform) ||
      // iPad on iOS 13 detection
      (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
    )
  }

  const hideOtherMenus = (): void => {
    setShowMediaIcons(false)
    setShowBottomIcons(false)
    setShowTouchPad(false)
  }

  const handleShowMediaIcons = () => {
    setShowMediaIcons(!showMediaIcons)
    const topButtonsState = localStorage.getItem('isTopButtonsShown') || ''
    localStorage.setItem('isTopButtonsShown', JSON.stringify(!JSON.parse(topButtonsState)))
  }

  const handleShowBottomIcons = () => {
    setShowBottomIcons(!showBottomIcons)
    const bottomButtonsState = localStorage.getItem('isBottomButtonsShown') || ''
    localStorage.setItem('isBottomButtonsShown', JSON.stringify(!JSON.parse(bottomButtonsState)))
  }

  const useOpacity = typeof useLoadingScreenOpacity !== 'undefined' && useLoadingScreenOpacity === true
  const layoutOpacity = useOpacity ? 1 - loadingSystemState.loadingScreenOpacity.value : 1
  const MediaIconHider = showMediaIcons ? KeyboardDoubleArrowUpIcon : KeyboardDoubleArrowDownIcon
  const BottomIconHider = showBottomIcons ? KeyboardDoubleArrowDownIcon : KeyboardDoubleArrowUpIcon
  // info about current mode to conditional render menus
  // TODO: Uncomment alerts when we can fix issues
  return (
    <div style={{ pointerEvents: 'auto' }}>
      <section>
        {conferenceMode && (
          <div className={styles.conferenceModeContainer}>
            <div className={styles.toolbar}>
              <Tooltip title={t('user:person.closeConferenceMode')}>
                <div className={styles.toolbarCrossButton} onClick={() => setConferenceMode(false)}>
                  <Close />
                </div>
              </Tooltip>
            </div>
            <ConferenceMode />
          </div>
        )}

        {children}

        {!conferenceMode && (
          <>
            <UserMenu
              animate={showBottomIcons ? styles.animateBottom : styles.fadeOutBottom}
              fadeOutBottom={styles.fadeOutBottom}
            />
            <Debug />

            {/** Container for fading most stuff in and out depending on if the location is loaded or not  */}
            <div style={{ opacity: layoutOpacity }}>
              <button
                type="button"
                className={`${showMediaIcons ? styles.btn : styles.smBtn} ${
                  showMediaIcons ? styles.rotate : styles.rotateBack
                } ${styles.showIconMedia} `}
                onClick={handleShowMediaIcons}
                onPointerDown={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                onPointerEnter={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
              >
                <MediaIconHider />
              </button>
              <MediaIconsBox animate={showMediaIcons ? styles.animateTop : styles.fadeOutTop} />
              <button
                type="button"
                className={`${showBottomIcons ? styles.btn : styles.smBtn} ${
                  showBottomIcons ? styles.rotate : styles.rotateBack
                } ${styles.showIcon} `}
                onClick={handleShowBottomIcons}
                onPointerDown={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                onPointerEnter={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
              >
                <BottomIconHider />
              </button>
              <UIDialog />
              {isTouchAvailable && showTouchPad && (
                <Suspense fallback={<></>}>
                  {' '}
                  <TouchGamepad layout="default" />{' '}
                </Suspense>
              )}
              <InviteToast />

              {!iOS() && (
                <>
                  {hideFullscreen ? null : fullScreenActive ? (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.fullScreen} ${
                        showBottomIcons ? styles.animateBottom : styles.fadeOutBottom
                      } `}
                      onClick={() => setFullScreenActive(false)}
                      onPointerUp={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                      onPointerEnter={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                    >
                      <FullscreenExit />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.fullScreen} ${
                        showBottomIcons ? styles.animateBottom : styles.fadeOutBottom
                      } `}
                      onClick={() => setFullScreenActive(true)}
                      onPointerUp={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                      onPointerEnter={() => AudioEffectPlayer.instance.play(AudioEffectPlayer.SOUNDS.ui)}
                    >
                      <ZoomOutMap />
                    </button>
                  )}
                </>
              )}
              <div className={styles.rightSidebar}>
                <div
                  className={`${styles.userMediaWindowsContainer} ${
                    showMediaIcons ? styles.animateTop : styles.fadeOutTop
                  }`}
                >
                  {!hideVideo && <UserMediaWindows className={styles.userMediaWindows} />}
                </div>

                {engineState.connectedWorld.value && (
                  <InstanceChat
                    animate={styles.animateBottom}
                    hideOtherMenus={hideOtherMenus}
                    setShowTouchPad={setShowTouchPad}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

export default Layout
