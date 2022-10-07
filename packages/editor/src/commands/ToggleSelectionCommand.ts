import { store } from '@xrengine/client-core/src/store'
import { Entity } from '@xrengine/engine/src/ecs/classes/Entity'
import { addComponent, removeComponent } from '@xrengine/engine/src/ecs/functions/ComponentFunctions'
import { getEntityNodeArrayFromEntities } from '@xrengine/engine/src/ecs/functions/EntityTreeFunctions'
import { SelectTagComponent } from '@xrengine/engine/src/scene/components/SelectTagComponent'

import { executeCommand } from '../classes/History'
import EditorCommands, { CommandFuncType, CommandParams, SelectionCommands } from '../constants/EditorCommands'
import { cancelGrabOrPlacement } from '../functions/cancelGrabOrPlacement'
import { serializeObject3DArray } from '../functions/debug'
import { updateOutlinePassSelection } from '../functions/updateOutlinePassSelection'
import { accessSelectionState, SelectionAction } from '../services/SelectionServices'

export type ToggleSelectionCommandUndoParams = {
  selection: Entity[]
}

export type ToggleSelectionCommandParams = CommandParams & {
  type: SelectionCommands.TOGGLE_SELECTION

  undo?: ToggleSelectionCommandUndoParams
}

function prepare(command: ToggleSelectionCommandParams) {
  if (command.keepHistory) {
    command.undo = { selection: accessSelectionState().selectedEntities.value.slice(0) }
  }
}

function execute(command: ToggleSelectionCommandParams) {
  emitEventBefore(command)

  const selectedEntities = accessSelectionState().selectedEntities.value.slice(0)

  for (let i = 0; i < command.affectedNodes.length; i++) {
    const node = command.affectedNodes[i]
    let index = selectedEntities.indexOf(node.entity)

    if (index > -1) {
      selectedEntities.splice(index, 1)
      removeComponent(node.entity, SelectTagComponent)
    } else {
      addComponent(node.entity, SelectTagComponent, {})
      selectedEntities.push(node.entity)
    }
  }

  store.dispatch(SelectionAction.updateSelection(selectedEntities))

  emitEventAfter(command)
}

function undo(command: ToggleSelectionCommandParams) {
  if (command.undo) {
    executeCommand({
      type: EditorCommands.REPLACE_SELECTION,
      affectedNodes: getEntityNodeArrayFromEntities(command.undo.selection)
    })
  }
}

function emitEventBefore(command: ToggleSelectionCommandParams) {
  if (command.preventEvents) return

  cancelGrabOrPlacement()
  store.dispatch(SelectionAction.changedBeforeSelection())
}

function emitEventAfter(command: ToggleSelectionCommandParams) {
  if (command.preventEvents) return
  updateOutlinePassSelection()
}

function toString(command: ToggleSelectionCommandParams) {
  return `SelectMultipleCommand id: ${command.id} objects: ${serializeObject3DArray(command.affectedNodes)}`
}

export const ToggleSelectionCommand: CommandFuncType = {
  prepare,
  execute,
  undo,
  emitEventAfter,
  emitEventBefore,
  toString
}
