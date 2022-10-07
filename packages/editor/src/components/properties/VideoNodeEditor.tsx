import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useEngineState } from '@xrengine/engine/src/ecs/classes/EngineState'
import { getComponent, hasComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { ErrorComponent } from '@xrengine/engine/src/scene/components/ErrorComponent'
import { MediaComponent } from '@xrengine/engine/src/scene/components/MediaComponent'
import { Object3DComponent } from '@xrengine/engine/src/scene/components/Object3DComponent'
import { VideoComponent } from '@xrengine/engine/src/scene/components/VideoComponent'
import { toggleVideo } from '@xrengine/engine/src/scene/functions/loaders/VideoFunctions'

import VideocamIcon from '@mui/icons-material/Videocam'

import { PropertiesPanelButton } from '../inputs/Button'
import InputGroup from '../inputs/InputGroup'
import { ControlledStringInput } from '../inputs/StringInput'
import VideoInput from '../inputs/VideoInput'
import MediaSourceProperties from './MediaSourceProperties'
import NodeEditor from './NodeEditor'
import { EditorComponentType, updateProperty } from './Util'

/**
 * VideoNodeEditor used to render editor view for property customization.
 *
 * @author Robert Long
 * @param       {any} props
 * @constructor
 */
export const VideoNodeEditor: EditorComponentType = (props) => {
  const { t } = useTranslation()
  const [_, setState] = useState(0)
  const engineState = useEngineState()
  const obj3d = getComponent(props.node.entity, Object3DComponent)?.value

  const forceUpdate = () => setState(Math.random())

  useEffect(() => {
    if (obj3d && obj3d.userData.videoEl) {
      obj3d.userData.videoEl.addEventListener('playing', forceUpdate)
      obj3d.userData.videoEl.addEventListener('pause', forceUpdate)
    }
    return () => {
      if (obj3d && obj3d.userData.videoEl) {
        obj3d.userData.videoEl.removeEventListener('playing', forceUpdate)
        obj3d.userData.videoEl.removeEventListener('pause', forceUpdate)
      }
    }
  }, [props.node.entity])

  const videoComponent = getComponent(props.node.entity, VideoComponent)
  const mediaComponent = getComponent(props.node.entity, MediaComponent)
  const hasError = engineState.errorEntities[props.node.entity].get() || hasComponent(props.node.entity, ErrorComponent)

  return (
    <NodeEditor
      {...props}
      name={t('editor:properties.video.name')}
      description={t('editor:properties.video.description')}
    >
      <InputGroup name="Video" label={t('editor:properties.video.lbl-video')}>
        <VideoInput value={videoComponent.videoSource} onChange={updateProperty(VideoComponent, 'videoSource')} />
        {hasError && <div style={{ marginTop: 2, color: '#FF8C00' }}>{t('editor:properties.video.error-url')}</div>}
      </InputGroup>
      <InputGroup name="Location" label={t('editor:properties.video.lbl-id')}>
        <ControlledStringInput
          value={videoComponent.elementId}
          onChange={updateProperty(VideoComponent, 'elementId')}
        />
      </InputGroup>
      <MediaSourceProperties node={props.node} multiEdit={props.multiEdit} />
      <PropertiesPanelButton onClick={() => toggleVideo(props.node.entity)}>
        {mediaComponent.playing ? t('editor:properties.video.lbl-pause') : t('editor:properties.video.lbl-play')}
      </PropertiesPanelButton>
    </NodeEditor>
  )
}

// setting iconComponent with icon name
VideoNodeEditor.iconComponent = VideocamIcon

export default VideoNodeEditor
