import React, { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { Color, MathUtils, Texture } from 'three'

import { removeComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import {
  extractDefaults,
  formatMaterialArgs,
  materialIdToDefaultArgs
} from '@xrengine/engine/src/renderer/materials/functions/Utilities'
import { MaterialLibrary } from '@xrengine/engine/src/renderer/materials/MaterialLibrary'
import { PatternTarget } from '@xrengine/engine/src/renderer/materials/MaterialParms'
import { MaterialOverrideComponent } from '@xrengine/engine/src/scene/components/MaterialOverrideComponent'
import { refreshMaterials } from '@xrengine/engine/src/scene/functions/loaders/MaterialOverrideFunctions'

import { Typography } from '@mui/material'
import { Box } from '@mui/system'

import { AssetLoader } from '../../../../engine/src/assets/classes/AssetLoader'
import CollapsibleBlock from '../layout/CollapsibleBlock'
import BooleanInput from './BooleanInput'
import { Button } from './Button'
import ColorInput from './ColorInput'
import CompoundNumericInput from './CompoundNumericInput'
import { ImagePreviewInputGroup } from './ImagePreviewInput'
import InputGroup, { InputGroupContent, InputGroupVerticalContainerWide, InputGroupVerticalContent } from './InputGroup'
import NumericInput from './NumericInput'
import SelectInput from './SelectInput'
import StringInput, { ControlledStringInput } from './StringInput'
import { TexturePreviewInputGroup } from './TexturePreviewInput'

export default function MaterialAssignment({ entity, node, modelComponent, values, onChange }) {
  let [count, setCount] = useState(values.length)
  let [materialIDs, setMaterialIDs] = useState<any[]>(
    [...MaterialLibrary.materials.entries()].map(([k, v]) => {
      return { label: v.material.name, value: k }
    })
  )

  function texKey(index, k) {
    if (!values[index].uuid) {
      values[index].uuid = MathUtils.generateUUID()
    }
    return `${values[index].uuid}-${k}`
  }

  const initialPaths: Map<string, string> = new Map(
    values.flatMap((entry, index) => {
      return entry.args
        ? Object.entries(entry.args)
            .filter(([k, v]) => (v as Texture)?.isTexture && (v as Texture).source.data)
            .map(([k, v]) => [texKey(index, k), (v as Texture).source.data.src])
        : []
    })
  )
  let [texturePaths, setTexturePaths] = useState<Map<string, string>>(initialPaths)

  const [expanded, setExpanded] = useState<Map<string, boolean>>(
    new Map(values.map((_, index) => [texKey(index, 'expanded'), false]))
  )

  const { t } = useTranslation()

  function onChangeSize(text) {
    const count = parseInt(text)
    let preCount = 0
    if (!values) values = []
    else preCount = values.length
    if (count == undefined || preCount == count) return
    if (preCount > count) values.splice(count)
    else
      for (let i = 0; i < count - preCount; i++) {
        values.push({
          entity: -1,
          targetEntity: node.entity,
          materialID: '',
          args: {},
          patternTarget: PatternTarget.OBJ3D,
          pattern: '~',
          uuid: MathUtils.generateUUID()
        })
      }
    preCount = count
    onChange(values)
  }

  function onRemoveEntry(idx) {
    return () => {
      const removing = values[idx]
      clearTexturePaths(removing, idx)
      values.splice(idx, 1)
      if (removing.entity > -1) removeComponent(removing.entity, MaterialOverrideComponent)
      setCount(values.length)
      onChangeSize(values.length)
    }
  }

  function clearTexturePaths(args, index) {
    if (!args) return
    const removingPaths = new Map(
      Object.entries(args)
        .filter(([k, v]) => (v as Texture).isTexture)
        .map(([k, v]) => [texKey(index, k), v])
    )
    const nuPaths = new Map([...texturePaths.entries()].filter(([k, v]) => !removingPaths.has(k)))
    setTexturePaths(nuPaths)
  }

  function onAddEntry() {
    setCount(values.length + 1)
    onChangeSize(`${values.length + 1}`)
  }

  function onChangeAssignment(assignment, index) {
    values[index] = assignment
    onChange(values)
  }

  async function onRefresh() {
    const nuVals = await refreshMaterials(node.entity)
    values.forEach((_, idx) => (values[idx] = nuVals[idx]))
    onChange(values)
  }

  function MaterialAssignmentEntry(index) {
    const assignment = modelComponent.materialOverrides[index]
    function setAssignmentProperty(prop) {
      return (value) => {
        assignment[prop] = value
        onChangeAssignment(assignment, index)
      }
    }

    function getArguments(materialID) {
      try {
        const defaultArguments = materialIdToDefaultArgs(materialID)
        const defaultValues = extractDefaults(defaultArguments)
        const argStructure = defaultArguments
        const argValues = formatMaterialArgs(
          assignment.args ? { ...defaultValues, ...assignment.args } : defaultValues,
          defaultArguments
        )

        function setArgsProp(prop) {
          return (value) => {
            if (!assignment.args) assignment.args = argValues
            assignment.args[prop] = value
            onChange(values)
          }
        }

        function setArgArrayProp(prop, arrayIndex) {
          return (value) => {
            if (!assignment.args) assignment.args = argValues
            assignment.args[prop][arrayIndex] = value
            onChange(values)
          }
        }

        if (argValues === undefined) {
          console.warn('no default arguments detected for material ' + materialID)
          return (
            <div>
              <p>No Arguments Detected</p>
            </div>
          )
        }

        function traverseArgs(args) {
          const id = `${entity}-${index}-args`
          return (
            <CollapsibleBlock key={id} name="Arguments" label="Arguments">
              {Object.entries(args).map(([k, v]: [string, any]) => {
                let compKey = `${entity}-${index}-args-${k}`
                switch (v.type) {
                  case 'normalized-float':
                  case 'float':
                    return (
                      <InputGroup key={compKey} name={k} label={k}>
                        <CompoundNumericInput value={argValues[k]} onChange={setArgsProp(k)} min={v.min} max={v.max} />
                      </InputGroup>
                    )
                  case 'color':
                    return (
                      <InputGroup key={compKey} name={k} label={k}>
                        <ColorInput value={argValues[k]} onChange={setArgsProp(k)} />
                      </InputGroup>
                    )
                  case 'vec2':
                  case 'vec3':
                    return (
                      <InputGroup key={compKey} name={k} label={k}>
                        {(argValues[k] as number[]).map((arrayVal, idx) => {
                          return (
                            <NumericInput
                              key={`${compKey}-${idx}`}
                              value={arrayVal}
                              onChange={setArgArrayProp(k, idx)}
                            />
                          )
                        })}
                      </InputGroup>
                    )
                  case 'string':
                    return (
                      <InputGroup key={compKey} name={k} label={k}>
                        <StringInput value={argValues[k]} onChange={setArgsProp(k)} />
                      </InputGroup>
                    )
                  case 'boolean':
                    return (
                      <InputGroup key={compKey} name={k} label={k}>
                        <BooleanInput value={argValues[k]} onChange={setArgsProp(k)} />
                      </InputGroup>
                    )
                  case 'texture':
                    const argKey = texKey(index, k)
                    const setTexture = setArgsProp(k)
                    function onChangeTexturePath(value) {
                      const nuPaths = new Map(texturePaths.entries())
                      nuPaths.set(argKey, value)
                      setTexturePaths(nuPaths)
                      if (assignment.args === undefined) assignment.args = argValues
                      setTexture(value)
                    }
                    return (
                      <TexturePreviewInputGroup
                        key={compKey}
                        name={k}
                        label={k}
                        value={texturePaths.get(argKey)}
                        onChange={onChangeTexturePath}
                      />
                    )
                }
              })}
            </CollapsibleBlock>
          )
        }
        return traverseArgs(argStructure)
      } catch (e) {
        console.warn('Failed to get Material arguments:\nerror:' + e)
        return <></>
      }
    }

    function onChangeMaterialID(value) {
      clearTexturePaths(assignment.args, index)
      delete assignment.args
      assignment.materialID = value
      onChangeAssignment(assignment, index)
    }

    return (
      <div key={`${entity}-${index}-entry`}>
        <span>
          <InputGroup
            key={`${entity}-${index}-materialID`}
            name="Material ID"
            label={t('editor:properties.materialAssignment.lbl-materialID')}
          >
            <SelectInput
              error={t('editor:properties.materialAssignment.error-materialID')}
              placeholder={t('editor:properties.materialAssignment.placeholder-materialID')}
              value={assignment.materialID}
              onChange={onChangeMaterialID}
              options={materialIDs}
              creatable={false}
              isSearchable={true}
            />
          </InputGroup>

          {getArguments(assignment.materialID)}

          <InputGroup
            key={`${entity}-${index}-patternTarget`}
            name={`Pattern Target`}
            label={t('editor:properties.materialAssignment.lbl-patternTarget')}
          >
            <SelectInput
              value={assignment.patternTarget}
              onChange={setAssignmentProperty('patternTarget')}
              options={[
                { label: 'Object3D Name', value: PatternTarget.OBJ3D },
                { label: 'Mesh Name', value: PatternTarget.MESH },
                { label: 'Material Name', value: PatternTarget.MATERIAL }
              ]}
            />
          </InputGroup>
          <InputGroup
            key={`${entity}-${index}-pattern`}
            name="Pattern"
            label={t('editor:properties.materialAssignment.lbl-pattern')}
          >
            <StringInput value={assignment.pattern} onChange={setAssignmentProperty('pattern')} />
          </InputGroup>
        </span>
        <div>
          <Button onClick={onRemoveEntry(index)} style={{ background: '#a21' }}>
            Delete
          </Button>
        </div>
      </div>
    )
  }

  return (
    <CollapsibleBlock label={'Material Overrides'}>
      <InputGroupVerticalContainerWide>
        {values?.length > 0 &&
          (() => {
            return (
              <Box component="div">
                <Button onClick={onRefresh}>
                  <p>Refresh</p>
                </Button>
              </Box>
            )
          })()}
        <InputGroupVerticalContent>
          <div>
            <label> Count: </label>
            <ControlledStringInput value={count} onChange={onChangeSize} />
            <Button onClick={onAddEntry}>+</Button>
          </div>
          {values &&
            values.map((value, idx) => {
              return (
                <div key={`${entity}-${idx}-overrideEntry`}>
                  <label>{idx + 1}: </label>
                  {MaterialAssignmentEntry(idx)}
                </div>
              )
            })}
        </InputGroupVerticalContent>
      </InputGroupVerticalContainerWide>
    </CollapsibleBlock>
  )
}
