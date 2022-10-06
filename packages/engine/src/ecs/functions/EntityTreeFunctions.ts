import { MathUtils } from 'three'

import { NameComponent } from '../../scene/components/NameComponent'
import { SceneObjectComponent } from '../../scene/components/SceneObjectComponent'
import { SceneTagComponent } from '../../scene/components/SceneTagComponent'
import { VisibleComponent } from '../../scene/components/VisibleComponent'
import { setLocalTransformComponent } from '../../transform/components/LocalTransformComponent'
import { setTransformComponent, TransformComponent } from '../../transform/components/TransformComponent'
import { Engine } from '../classes/Engine'
import { Entity } from '../classes/Entity'
import EntityTree, { EntityTreeNode } from '../classes/EntityTree'
import { addComponent, getComponent, setComponent } from './ComponentFunctions'
import { createEntity, entityExists, removeEntity } from './EntityFunctions'

// ========== Entity Tree Functions ========== //
/**
 * Adds passed node to all the tree maps
 * @param node Node to be added to the maps
 * @param tree Entity Tree
 */
export function addToEntityTreeMaps(node: EntityTreeNode, tree = Engine.instance.currentWorld.entityTree) {
  tree.entityNodeMap.set(node.entity, node)
  tree.uuidNodeMap.set(node.uuid, node)
}

/**
 * Removes passed node from all the tree maps
 * @param node Node to be removed from the maps
 * @param tree Entity tree
 */
export function removeFromEntityTreeMaps(node: EntityTreeNode, tree = Engine.instance.currentWorld.entityTree) {
  tree.entityNodeMap.delete(node.entity)
  tree.uuidNodeMap.delete(node.uuid)
}

/**
 * Initialize the world with enity tree
 * @param world World
 */
export function initializeEntityTree(world = Engine.instance.currentWorld): void {
  if (entityExists(world.sceneEntity)) removeEntity(world.sceneEntity, true)

  world.sceneEntity = createEntity()
  addComponent(world.sceneEntity, NameComponent, { name: 'scene' })
  addComponent(world.sceneEntity, VisibleComponent, true)

  world.entityTree = {
    rootNode: createEntityNode(world.sceneEntity),
    entityNodeMap: new Map(),
    uuidNodeMap: new Map()
  } as EntityTree
}

/**
 * Adds Entity to Entity tree
 * @param entityNode Entity node to be added into the tree
 * @param parentNode Parent node of the entity
 * @param index Index at which entiy node will be added in parent node
 * @param skipRootUpdate Whether the root of the tree should be updated or not
 * @param tree Entity Tree
 * @returns Newly created Entity Tree node
 */
export function addEntityNodeInTree(
  entityNode: EntityTreeNode,
  parentNode?: EntityTreeNode,
  index?: number,
  skipRootUpdate = false,
  tree = Engine.instance.currentWorld.entityTree
): EntityTreeNode {
  if (parentNode == null) {
    if (!skipRootUpdate) {
      tree.rootNode = entityNode
      addToEntityTreeMaps(entityNode, tree)
    }

    return tree.rootNode
  }

  const node = tree.entityNodeMap.get(entityNode.entity)

  if (node) {
    if (node.parentEntity !== parentNode.entity) reparentEntityNode(node, parentNode)
    return node
  }

  const parent = tree.entityNodeMap.get(parentNode.entity)

  if (!parent) {
    setComponent(tree.rootNode.entity, SceneTagComponent, true)
    addEntityNodeChild(tree.rootNode, parentNode)
  }

  addEntityNodeChild(parentNode, entityNode, index)

  return entityNode
}

/**
 * Empties the the tree and removes its element from memory
 * @param tree Entity tree
 */
export function emptyEntityTree(tree = Engine.instance.currentWorld.entityTree): void {
  const arr = [] as EntityTreeNode[]
  tree.entityNodeMap.forEach((node) => arr.push(node))

  for (let i = arr.length - 1; i >= 0; i--) {
    delete arr[i]
  }

  tree.rootNode = createEntityNode(createEntity())

  tree.entityNodeMap.clear()
  tree.uuidNodeMap.clear()
}
// ========== Entity Tree Functions ========== //

// ========== Entity Tree Node Functions ========== //
/**
 * Creates new Entity node with some default values
 * @param entity Entity of the newly created node
 * @param uuid UUID of newly created node. If not provided new one will be generated
 * @returns Newly created Entity node
 */
export function createEntityNode(entity: Entity, uuid?: string): EntityTreeNode {
  const node = {
    type: 'EntityNode' as const,
    entity,
    uuid: uuid ?? MathUtils.generateUUID(),
    children: []
  }
  addComponent(entity, SceneObjectComponent, true)
  setTransformComponent(entity)

  // addComponent(entity, NetworkObjectComponent, {
  //   ownerId: Engine.instance.currentWorld._worldHostId,
  //   networkId: //node.uuid as NetworkId,
  //   prefab: 'entity_node',
  //   parameters: null
  // })
  return node
}

/**
 * Adds entity node as a child of passed node
 * @param node Node in which child node will be added
 * @param child Child node to be added
 * @param index Index at which child node will be added
 */
export function addEntityNodeChild(node: EntityTreeNode, child: EntityTreeNode, index: number = -1): void {
  if (!node.children) node.children = []

  if (index < 0) {
    node.children.push(child.entity)
  } else {
    node.children.splice(index, 0, child.entity)
  }

  child.parentEntity = node.entity
  addToEntityTreeMaps(child)

  const parentTransform = getComponent(node.entity, TransformComponent)
  const childTransform = getComponent(child.entity, TransformComponent)
  if (parentTransform && childTransform) {
    const childLocalMatrix = parentTransform.matrix.clone().invert().multiply(childTransform.matrix)
    const localTransform = setLocalTransformComponent(child.entity, node.entity)
    childLocalMatrix.decompose(localTransform.position, localTransform.rotation, localTransform.scale)
  }
}

/**
 * Removes passed child node from passed entity node
 * @param node Entity node whose child will be removed
 * @param child Child node to be removed
 * @param tree Entity Tree
 * @returns Removed node
 */
export function removeEntityNodeChild(
  node: EntityTreeNode,
  child: EntityTreeNode,
  tree = Engine.instance.currentWorld.entityTree
): EntityTreeNode | undefined {
  if (!node.children) return

  let index = -1

  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i] === child.entity) {
      index = i
      break
    }
  }

  if (index > -1) {
    removeFromEntityTreeMaps(child, tree)
    return tree.entityNodeMap.get(node.children.splice(index, 1)[0])
  }
}

/**
 * Removes Entity node from its parent
 * @param node Node to be removed from parent
 * @param tree Entity tree
 * @returns Removed node
 */
export function removeEntityNodeFromParent(
  node: EntityTreeNode,
  tree = Engine.instance.currentWorld.entityTree
): EntityTreeNode | undefined {
  if (typeof node.parentEntity !== 'undefined') {
    const parent = tree.entityNodeMap.get(node.parentEntity)
    if (parent) return removeEntityNodeChild(parent, node, tree)
  }
}

/**
 * Reparent passed entity tree node to new parent node
 * @param node Node to be reparented
 * @param newParent Parent node
 * @param index Index at which passed node will be set as child in parent node's children arrays
 */
export function reparentEntityNode(node: EntityTreeNode, newParent: EntityTreeNode, index?: number): void {
  removeEntityNodeFromParent(node)
  addEntityNodeChild(newParent, node, index)
}

/**
 * Clones passed node
 * @param node Node to be cloned
 * @returns Cloned Entity tree node
 */
export function cloneEntityNode(node: EntityTreeNode): EntityTreeNode {
  return Object.assign({}, node)
}

/**
 * Traverse child nodes of the given node. Traversal will start from the passed node
 * @param node Node to be traverse
 * @param cb Callback function which will be called for every traverse
 * @param index index of the curren node in it's parent
 * @param tree Entity Tree
 */
export function traverseEntityNode(
  node: EntityTreeNode,
  cb: (node: EntityTreeNode, index: number) => void,
  index = 0,
  tree = Engine.instance.currentWorld.entityTree
): void {
  cb(node, index)

  if (!node.children) return

  for (let i = 0; i < node.children.length; i++) {
    const child = tree.entityNodeMap.get(node.children[i])
    if (child) traverseEntityNode(child, cb, i, tree)
  }
}

/**
 * Iteratively traverse parent nodes for given Entity Tree Node
 * @param node Node for which traversal will occur
 * @param cb Callback function which will be called for every traverse
 * @param pred Predicate function which will not process a node or its children if return false
 * @param tree Entity Tree
 */
export function iterateEntityNode(
  node: EntityTreeNode,
  cb: (node: EntityTreeNode, index: number) => void,
  pred: (node: EntityTreeNode) => boolean = (x) => true,
  tree = Engine.instance.currentWorld.entityTree,
  snubChildren: boolean = false
): void {
  const frontier = [[node]]
  while (frontier.length > 0) {
    const items = frontier.pop()!
    let idx = 0
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]
      if (pred(item)) {
        cb(item, idx)
        idx += 1
        if (snubChildren)
          frontier.push(
            item.children?.filter((x) => tree.entityNodeMap.has(x)).map((x) => tree.entityNodeMap.get(x)!) ?? []
          )
      }
      if (!snubChildren) {
        frontier.push(
          item.children?.filter((x) => tree.entityNodeMap.has(x)).map((x) => tree.entityNodeMap.get(x)!) ?? []
        )
      }
    }
  }
}

/**
 * Traverse parent nodes for given Entity Tree Node
 * @param node Node for which traversal will occur
 * @param cb Callback function which will be called for every traverse
 * @param tree Entity Tree
 */
export function traverseEntityNodeParent(
  node: EntityTreeNode,
  cb: (parent: EntityTreeNode) => void,
  tree = Engine.instance.currentWorld.entityTree
): void {
  if (typeof node.parentEntity !== 'undefined') {
    const parent = tree.entityNodeMap.get(node.parentEntity)

    if (parent) {
      cb(parent)
      traverseEntityNodeParent(parent, cb, tree)
    }
  }
}

/**
 * Checks whether the type of object is `EntityTreeNode` of not
 * @param node Object to check type of
 * @returns Whether the object is `EntityTreeNode` or not
 */
export function isEntityNode(node: any): node is EntityTreeNode {
  return node.type === 'EntityNode'
}

/**
 * Creates Entity Tree Node array from passed Entity array
 * @param entities Entity Array to get Entity node from
 * @param tree Entity Tree object
 * @returns Entity Tree node array obtained from passed Entities.
 */
export function getEntityNodeArrayFromEntities(
  entities: (Entity | string)[],
  tree = Engine.instance.currentWorld.entityTree
): (EntityTreeNode | string)[] {
  const arr = [] as (EntityTreeNode | string)[]
  const scene = Engine.instance.currentWorld.scene
  for (const entity of entities) {
    if (typeof entity === 'string') {
      scene.getObjectByProperty('uuid', entity) && arr.push(entity)
      continue
    }
    const node = tree.entityNodeMap.get(entity)
    if (node) arr.push(node)
  }

  return arr
}

/**
 * Finds the index of an entity tree node using entity.
 * This function is useful for node which is not contained in array but can have same entity as one of array elements
 * @param arr Nodes array
 * @param node Node to find index of
 * @returns index of the node if found -1 oterhwise.
 */
export function findIndexOfEntityNode(arr: (EntityTreeNode | string)[], node: string | EntityTreeNode): number {
  for (let i = 0; i < arr.length; i++) {
    const elt = arr[i]
    if (typeof elt !== typeof node) continue
    if (typeof node === 'string' && node === elt) return i
    if (typeof node === 'object' && (elt as EntityTreeNode).entity === node.entity) return i
  }

  return -1
}

// ========== Entity Tree Node Functions ========== //
