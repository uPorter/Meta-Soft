import { MathUtils } from 'three'
import { matches, Validator } from 'ts-matches'

import { UserId } from '@xrengine/common/src/interfaces/UserId'
import { deepEqual } from '@xrengine/engine/src/common/functions/deepEqual'

import { HyperFlux } from './StoreFunctions'

export type Action = {
  /**
   * The type of action
   */
  type: string
} & ActionOptions

export type ActionReceptor = (action: Action) => void

export type ActionRecipients = UserId | UserId[] | 'all' | 'others'

export type ActionCacheOptions =
  | boolean
  | {
      /**
       * If non-falsy, remove previous actions in the cache that match `$from` and `type` fields,
       * and any specified fields
       */
      removePrevious?: boolean | string[]
      /**
       * If true, do not cache this action
       */
      disable?: boolean
    }

export type ActionOptions = {
  /**
   * The uuid of this action, uniquely identifying it
   */
  $uuid?: string

  /**
   * The id of the sender
   */
  $from?: UserId

  /**
   * The intended recipients
   */
  $to?: ActionRecipients

  /**
   * The intended time for this action to be applied
   * - If this option is missing, the action is applied the next time applyIncomingActions() is called.
   * - If this action is received late (after the desired tick has passed), it is dispatched on the next tick.
   */
  $time?: number | undefined

  $topic?: string[]

  /**
   * Specifies how this action should be cached for newly joining clients.
   */
  $cache?: ActionCacheOptions

  /**
   * This action is being replayed from the cache
   */
  $fromCache?: true

  /**
   * The call stack at the time the action was dispatched
   */
  $stack?: string[]

  /**
   * An error that occurred while applying this action
   */
  $ERROR?: { message: string; stack: string[] }
}

type ActionShape<ActionType extends Action> = {
  [key in keyof ActionType]: key extends ActionType
    ? ActionType[key]
    : ActionType[key] extends Validator<unknown, unknown>
    ? ActionType[key]
    : ActionType[key] extends string | number | boolean | any
    ? ActionType[key] | Validator<unknown, ActionType[key]>
    : ActionType[key] extends MatchesWithDefault<unknown>
    ? ActionType[key]
    : never
}

// type t = ActionShape<{store:'test', type:'hello', $cache: {removePrevious: true}, count: MatchesWithDefault<number>}>

export type ResolvedActionShape<Shape extends ActionShape<any>> = {
  [key in keyof Shape]: Shape[key] extends Validator<unknown, infer B>
    ? Validator<unknown, B>
    : Shape[key] extends MatchesWithDefault<infer C>
    ? Validator<unknown, C>
    : Shape[key] extends string | number | boolean | any
    ? Validator<unknown, Shape[key]>
    : never
}

// type t = ResolvedActionShape<{store:'test', type:'hello', $cache: {removePrevious: true}, count: MatchesWithDefault<number>}>

export type ResolvedActionShapeWithOptionals<Shape extends ActionShape<any>> = {
  [key in keyof Shape]: Shape[key] extends Validator<unknown, infer B>
    ? Validator<unknown, B>
    : Shape[key] extends MatchesWithDefault<infer C>
    ? Validator<unknown, C | undefined> | C | undefined
    : Shape[key] extends string | number | boolean | any
    ? Validator<unknown, Shape[key] | undefined> | Shape[key] | undefined
    : never
}

// type t = PartialActionShape<{store:'test', type:'hello', param: number, count: MatchesWithDefault<number>}>

type ActionTypeFromShape<Shape extends ActionShape<any>> = {
  [key in keyof Shape]: Shape[key] extends Validator<unknown, infer A>
    ? Shape[key]['_TYPE'] | A
    : Shape[key] extends MatchesWithDefault<Shape[key]>
    ? Shape[key]['matches']
    : Shape[key]
}

// type t = ActionTypeFromShape<{store:'test', type:Validator<unknown,'hello'>, name:string, param: Validator<unknown,number>, count: MatchesWithDefault<number>}>

type IsOptional<T> = null extends T ? true : undefined extends T ? true : false

type JustOptionalKeys<Shape extends ActionShape<any>> = {
  [key in keyof Shape]: Shape[key] extends Validator<unknown, infer B>
    ? true extends IsOptional<B>
      ? key
      : never
    : true extends IsOptional<Shape[key]>
    ? key
    : never
}[keyof Shape]

type JustRequiredKeys<Shape extends ActionShape<any>> = {
  [key in keyof Shape]: Shape[key] extends Validator<unknown, infer B>
    ? true extends IsOptional<B>
      ? never
      : key
    : true extends IsOptional<Shape[key]>
    ? never
    : key
}[keyof Shape]

type JustOptionals<S extends ActionShape<any>> = Pick<S, JustOptionalKeys<S>>
type JustRequired<S extends ActionShape<any>> = Pick<S, JustRequiredKeys<S>>

export type ResolvedActionType<Shape extends ActionShape<any>> = Required<
  ActionTypeFromShape<ResolvedActionShape<Shape>> & ActionOptions
>
export type PartialActionType<Shape extends ActionShape<any>> = Omit<
  Partial<ActionTypeFromShape<JustOptionals<ResolvedActionShapeWithOptionals<Shape>>>> &
    ActionOptions &
    Required<ActionTypeFromShape<JustRequired<ResolvedActionShapeWithOptionals<Shape>>>>,
  'type' | 'store'
>

// type t = PartialActionType<{store:'TEST',type:'TEST',name:string, bla:Validator<unknown, any>}>

/**
 * Defines an action
 * @param actionShape
 * @returns a function that creates an instance of the defined action
 */
function defineAction<Shape extends ActionShape<Action>>(actionShape: Shape) {
  type ResolvedAction = ResolvedActionType<Shape>
  type PartialAction = PartialActionType<Shape>

  const shapeEntries = Object.entries(actionShape)

  // handle default callback properties
  const defaultEntries = shapeEntries.filter(
    ([k, v]: [string, any]) =>
      typeof v === 'object' && ('defaultValue' in v || ('parser' in v && v.parser.description.name === 'Default'))
  ) as Array<[string, MatchesWithDefault<any> | Validator<unknown, unknown>]>
  const defaultValidators = Object.fromEntries(
    defaultEntries.map(([k, v]) => [k, v instanceof Validator ? v : v.matches])
  )

  // handle literal shape properties
  const literalEntries = shapeEntries.filter(([k, v]) => typeof v !== 'object') as Array<
    [string, string | number | boolean]
  >
  const literalValidators = Object.fromEntries(literalEntries.map(([k, v]) => [k, matches.literal(v)]))

  // handle option properties
  const optionEntries = shapeEntries.filter(([k, v]) => k.startsWith('$')) as Array<
    [string, ActionOptions[keyof ActionOptions]]
  >
  const optionValidators = Object.fromEntries(
    optionEntries.map(([k, v]) => [k, matches.guard<unknown, typeof v>((val): val is typeof v => deepEqual(val, v))])
  )

  // create resolved action shape
  const resolvedActionShape = Object.assign(
    {},
    actionShape,
    optionValidators,
    literalValidators,
    defaultValidators
  ) as any
  const allValuesNull = Object.fromEntries(Object.entries(resolvedActionShape).map(([k]) => [k, null]))

  const matchesShape = matches.shape(resolvedActionShape) as Validator<unknown, ResolvedAction>

  const actionCreator = (partialAction: PartialAction = {} as any) => {
    const defaultValues = Object.fromEntries(
      defaultEntries.map(([k, v]) => [
        k,
        partialAction[k] ?? ('defaultValue' in v ? v.defaultValue() : v.parser['defaultValue'])
      ]) as [string, any]
    )
    let action = {
      ...allValuesNull,
      ...Object.fromEntries([...optionEntries, ...literalEntries]),
      ...defaultValues,
      ...partialAction
    }
    return matchesShape.unsafeCast(action) as ResolvedAction
  }

  actionCreator.actionShape = actionShape
  actionCreator.resolvedActionShape = resolvedActionShape as ResolvedActionShape<Shape>
  actionCreator.type = actionShape.type
  actionCreator.matches = matchesShape

  return actionCreator
}

/**
 * Dispatch actions to the store.
 * @param store
 * @param action
 */
const dispatchAction = <A extends Action>(
  action: A,
  topics: string[] = [HyperFlux.store.defaultTopic],
  store = HyperFlux.store
) => {
  const storeId = store.getDispatchId()

  action.$from = action.$from ?? (storeId as UserId)
  action.$to = action.$to ?? 'all'
  action.$time = action.$time ?? store.getDispatchTime() + store.defaultDispatchDelay
  action.$cache = action.$cache ?? false
  action.$uuid = action.$uuid ?? MathUtils.generateUUID()
  action.$topic = topics

  if (process.env.APP_ENV === 'development' && !action.$stack) {
    const trace = { stack: '' }
    Error.captureStackTrace?.(trace, dispatchAction) // In firefox captureStackTrace is undefined
    const stack = trace.stack.split('\n')
    stack.shift()
    action.$stack = stack
  }

  for (const topic of topics) {
    const mode = store.getDispatchMode(topic)
    if (mode === 'local' || mode === 'host') store.actions.incoming.push(action as Required<Action>)
    else store.actions.outgoing[topic].queue.push(action as Required<Action>)
  }
}

function addTopic(topic: string, store = HyperFlux.store) {
  console.log(`[HyperFlux]: Added topic ${topic}`)
  if (!store.actions.outgoing[topic])
    store.actions.outgoing[topic] = {
      queue: [],
      history: [],
      historyUUIDs: new Set()
    }
  if (!store.actions.cached[topic]) store.actions.cached[topic] = []
}

function removeTopic(topic: string, store = HyperFlux.store) {
  console.log(`[HyperFlux]: Removed topic ${topic}`)
  delete store.actions.outgoing[topic]
  delete store.actions.cached[topic]
}

/**
 * Adds an action receptor to the store
 * @param store
 * @param receptor
 */
function addActionReceptor(receptor: ActionReceptor, store = HyperFlux.store) {
  ;(store.receptors as Array<ActionReceptor>).push(receptor)
}

/**
 * Removes an action receptor from the store
 * @param store
 * @param receptor
 */
function removeActionReceptor(receptor: ActionReceptor, store = HyperFlux.store) {
  const idx = store.receptors.indexOf(receptor)
  if (idx >= 0) (store.receptors as Array<ActionReceptor>).splice(idx, 1)
}

const _updateCachedActions = (incomingAction: Required<Action>, store = HyperFlux.store) => {
  if (incomingAction.$cache) {
    for (const topic of incomingAction.$topic) {
      if (!store.actions.cached[topic]) store.actions.cached[topic] = []
      const cachedActions = store.actions.cached[topic]
      // see if we must remove any previous actions
      if (typeof incomingAction.$cache === 'boolean') {
        if (incomingAction.$cache) cachedActions.push(incomingAction)
      } else {
        const remove = incomingAction.$cache.removePrevious

        if (remove) {
          for (const a of [...cachedActions]) {
            if (a.$from === incomingAction.$from && a.type === incomingAction.type) {
              if (remove === true) {
                const idx = cachedActions.indexOf(a)
                cachedActions.splice(idx, 1)
              } else {
                let matches = true
                for (const key of remove) {
                  if (!deepEqual(a[key], incomingAction[key])) {
                    matches = false
                    break
                  }
                }
                if (matches) {
                  const idx = cachedActions.indexOf(a)
                  cachedActions.splice(idx, 1)
                }
              }
            }
          }
        }

        if (!incomingAction.$cache.disable) cachedActions.push(incomingAction)
      }
    }
  }
}

const applyIncomingActionsToAllQueues = (action: Action, store = HyperFlux.store) => {
  for (const [shape, queues] of store.actions.queues) {
    matches(action).when(shape, () => {
      for (const queue of queues) {
        queue.push(action)
      }
    })
  }
}

const _applyIncomingAction = (action: Required<Action>, store = HyperFlux.store) => {
  // ensure actions are idempotent
  if (store.actions.incomingHistoryUUIDs.has(action.$uuid)) {
    const idx = store.actions.incoming.indexOf(action)
    store.actions.incoming.splice(idx, 1)
    return
  }

  _updateCachedActions(action, store)

  applyIncomingActionsToAllQueues(action, store)

  try {
    console.log(`[Action]: ${action.type}`, action)
    for (const receptor of [...store.receptors]) receptor(action)
    store.actions.incomingHistory.push(action)
    for (const topic of action.$topic) {
      if (store.getDispatchMode(topic) === 'host') {
        store.actions.outgoing[topic].queue.push(action)
      }
    }
  } catch (e) {
    const message = (e as Error).message
    const stack = (e as Error).stack!.split('\n')
    stack.shift()
    store.actions.incomingHistory.push({
      // @ts-ignore
      $ERROR: { message, stack },
      ...action
    })
    console.error(e)
  } finally {
    store.actions.incomingHistoryUUIDs.add(action.$uuid)
    const idx = store.actions.incoming.indexOf(action)
    store.actions.incoming.splice(idx, 1)
  }
}

/**
 * Process incoming actions
 *
 * @param store
 */
const applyIncomingActions = (store = HyperFlux.store) => {
  const { incoming } = store.actions
  const now = store.getDispatchTime()
  for (const action of [...incoming]) {
    if (action.$time > now) {
      continue
    }
    _applyIncomingAction(action, store)
  }
}

/**
 * Clear the outgoing action queue
 * @param store
 */
const clearOutgoingActions = (store = HyperFlux.store) => {
  for (const [topic, outgoing] of Object.entries(store.actions.outgoing)) {
    const { queue, history, historyUUIDs } = outgoing
    for (const action of queue) {
      history.push(action)
      historyUUIDs.add(action.$uuid)
    }
    queue.length = 0
  }
}

const createActionQueue = (shape: Validator<any, any>, store = HyperFlux.store) => {
  if (!store.actions.queues.get(shape)) store.actions.queues.set(shape, [])
  const queue = [] as any[]
  store.actions.queues.get(shape)!.push(queue)
  return () => {
    const result = [...queue]
    queue.length = 0
    return result
  }
}

export default {
  defineAction,
  dispatchAction,
  addActionReceptor,
  createActionQueue,
  addTopic,
  removeTopic,
  removeActionReceptor,
  applyIncomingActions,
  clearOutgoingActions
}

export type MatchesWithDefault<A> = { matches: Validator<unknown, A>; defaultValue: () => A }
