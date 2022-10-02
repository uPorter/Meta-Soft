import {
  ActiveCollisionTypes,
  ActiveEvents,
  ColliderDesc,
  RigidBodyDesc,
  RigidBodyType
} from '@dimforge/rapier3d-compat'
import assert from 'assert'
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'

import { AvatarDirection } from '../../common/constants/Axis3D'
import { Engine } from '../../ecs/classes/Engine'
import { addComponent, getComponent, hasComponent } from '../../ecs/functions/ComponentFunctions'
import { createEntity } from '../../ecs/functions/EntityFunctions'
import { createEngine } from '../../initializeEngine'
import { addObjectToGroup } from '../../scene/components/GroupComponent'
import { setTransformComponent } from '../../transform/components/TransformComponent'
import { CollisionComponent } from '../components/CollisionComponent'
import {
  getTagComponentForRigidBody,
  RigidBodyComponent,
  RigidBodyDynamicTagComponent,
  RigidBodyFixedTagComponent
} from '../components/RigidBodyComponent'
import { CollisionGroups, DefaultCollisionMask } from '../enums/CollisionGroups'
import { getInteractionGroups } from '../functions/getInteractionGroups'
import { boxDynamicConfig } from '../functions/physicsObjectDebugFunctions'
import { CollisionEvents, SceneQueryType } from '../types/PhysicsTypes'
import { Physics } from './Physics'

describe('Physics', () => {
  beforeEach(async () => {
    createEngine()
    await Physics.load()
    Engine.instance.currentWorld.physicsWorld = Physics.createWorld()
    Engine.instance.currentWorld.physicsWorld.timestep = 1 / 60
  })

  it('should create rapier world & event queue', async () => {
    const world = Physics.createWorld()
    const eventQueue = Physics.createCollisionEventQueue()
    assert(world)
    assert(eventQueue)
  })

  it('should create & remove rigidBody', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity = createEntity(world)
    setTransformComponent(entity)

    const rigidBodyDesc = RigidBodyDesc.dynamic()
    const colliderDesc = ColliderDesc.ball(1)

    const rigidBody = Physics.createRigidBody(entity, physicsWorld, rigidBodyDesc, [colliderDesc])

    assert.deepEqual(physicsWorld.bodies.len(), 1)
    assert.deepEqual(physicsWorld.colliders.len(), 1)
    assert.deepEqual(hasComponent(entity, RigidBodyComponent), true)
    assert.deepEqual(getComponent(entity, RigidBodyComponent).body, rigidBody)
    assert.deepEqual(hasComponent(entity, RigidBodyDynamicTagComponent), true)
    assert.deepEqual((rigidBody.userData as any)['entity'], entity)

    Physics.removeRigidBody(entity, physicsWorld)
    assert.deepEqual(physicsWorld.bodies.len(), 0)
    assert.deepEqual(hasComponent(entity, RigidBodyComponent), false)
    assert.deepEqual(hasComponent(entity, RigidBodyDynamicTagComponent), false)
  })

  it('component type should match rigid body type', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld
    const entity = createEntity(world)

    setTransformComponent(entity)

    const rigidBodyDesc = RigidBodyDesc.fixed()
    const colliderDesc = ColliderDesc.ball(1)

    const rigidBody = Physics.createRigidBody(entity, physicsWorld, rigidBodyDesc, [colliderDesc])
    const rigidBodyComponent = getTagComponentForRigidBody(rigidBody.bodyType())

    assert.deepEqual(rigidBodyComponent, RigidBodyFixedTagComponent)
  })

  it('should create collider desc from input config data', async () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.translateX(10)
    mesh.rotateX(3.1415918)

    const collisionGroup = 0x0001
    const collisionMask = 0x0003
    boxDynamicConfig.collisionLayer = collisionGroup
    boxDynamicConfig.collisionMask = collisionMask
    boxDynamicConfig.isTrigger = true

    const boxColliderDesc = Physics.createColliderDesc(mesh, boxDynamicConfig)
    const interactionGroups = getInteractionGroups(collisionGroup, collisionMask)

    assert.deepEqual(boxColliderDesc.shape.type, boxDynamicConfig.type)
    assert.deepEqual(boxColliderDesc.collisionGroups, interactionGroups)
    assert.deepEqual(boxColliderDesc.isSensor, boxDynamicConfig.isTrigger)
    assert.deepEqual(boxColliderDesc.friction, boxDynamicConfig.friction)
    assert.deepEqual(boxColliderDesc.restitution, boxDynamicConfig.restitution)
    assert.deepEqual(boxColliderDesc.activeEvents, ActiveEvents.COLLISION_EVENTS)
    assert.deepEqual(boxColliderDesc.activeCollisionTypes, ActiveCollisionTypes.ALL)
    assert.deepEqual(boxColliderDesc.translation.x, mesh.position.x)
    assert.deepEqual(boxColliderDesc.translation.y, mesh.position.y)
    assert.deepEqual(boxColliderDesc.translation.z, mesh.position.z)
    assert.deepEqual(boxColliderDesc.rotation.x, mesh.quaternion.x)
    assert.deepEqual(boxColliderDesc.rotation.y, mesh.quaternion.y)
    assert.deepEqual(boxColliderDesc.rotation.z, mesh.quaternion.z)
    assert.deepEqual(boxColliderDesc.rotation.w, mesh.quaternion.w)
  })

  it('should create rigid body from input mesh & config data', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity = createEntity(world)
    setTransformComponent(entity)

    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new Mesh(geometry, material)
    mesh.translateX(10)
    mesh.rotateX(3.1415918)
    addObjectToGroup(entity, mesh)

    const collisionGroup = 0x0001
    const collisionMask = 0x0003
    boxDynamicConfig.collisionLayer = collisionGroup
    boxDynamicConfig.collisionMask = collisionMask

    const rigidBody = Physics.createRigidBodyForGroup(entity, physicsWorld, boxDynamicConfig)
    const interactionGroups = getInteractionGroups(collisionGroup, collisionMask)

    const collider = rigidBody.collider(0)
    assert.deepEqual(hasComponent(entity, RigidBodyComponent), true)
    assert.deepEqual(getComponent(entity, RigidBodyComponent).body, rigidBody)
    assert.deepEqual(hasComponent(entity, RigidBodyFixedTagComponent), true)
    assert.deepEqual(hasComponent(entity, RigidBodyDynamicTagComponent), false)
    assert.deepEqual(rigidBody.bodyType(), boxDynamicConfig.bodyType)
    assert.deepEqual(collider.shape.type, boxDynamicConfig.type)
    assert.deepEqual(collider.collisionGroups(), interactionGroups)
    assert.deepEqual(collider.isSensor(), boxDynamicConfig.isTrigger)
    assert.deepEqual(collider.friction(), boxDynamicConfig.friction)
    assert.deepEqual(collider.activeEvents(), ActiveEvents.COLLISION_EVENTS)
    assert.deepEqual(collider.activeCollisionTypes(), ActiveCollisionTypes.ALL)
  })

  it('should change rigidBody type', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity = createEntity(world)
    setTransformComponent(entity)

    const rigidBodyDesc = RigidBodyDesc.dynamic()
    const colliderDesc = ColliderDesc.ball(1)

    const rigidBody = Physics.createRigidBody(entity, physicsWorld, rigidBodyDesc, [colliderDesc])

    assert.deepEqual(physicsWorld.bodies.len(), 1)
    assert.deepEqual(rigidBody.bodyType(), RigidBodyType.Dynamic)
    assert.deepEqual(hasComponent(entity, RigidBodyDynamicTagComponent), true)

    Physics.changeRigidbodyType(entity, RigidBodyType.Fixed)
    assert.deepEqual(rigidBody.bodyType(), RigidBodyType.Fixed)
    assert.deepEqual(hasComponent(entity, RigidBodyDynamicTagComponent), false)
    assert.deepEqual(hasComponent(entity, RigidBodyFixedTagComponent), true)
  })

  it('should create accurate InteractionGroups', async () => {
    const collisionGroup = 0x0001
    const collisionMask = 0x0003
    const interactionGroups = getInteractionGroups(collisionGroup, collisionMask)

    assert.deepEqual(interactionGroups, 65539)
  })

  it('should cast ray and hit rigidbody', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity = createEntity(world)

    const rigidBodyDesc = RigidBodyDesc.dynamic().setTranslation(10, 0, 0)
    const colliderDesc = ColliderDesc.cylinder(5, 5).setCollisionGroups(
      getInteractionGroups(CollisionGroups.Default, CollisionGroups.Default)
    )

    const rigidBody = Physics.createRigidBody(entity, physicsWorld, rigidBodyDesc, [colliderDesc])

    physicsWorld.step()

    const raycastComponentData = {
      type: SceneQueryType.Closest,
      origin: new Vector3().set(0, 0, 0),
      direction: AvatarDirection.Left,
      maxDistance: 20,
      groups: getInteractionGroups(CollisionGroups.Default, CollisionGroups.Default)
    }
    const hits = Physics.castRay(physicsWorld, raycastComponentData)

    assert.deepEqual(hits.length, 1)
    assert.deepEqual(hits[0].normal.x, -1)
    assert.deepEqual(hits[0].distance, 5)
    assert.deepEqual(hits[0].body, rigidBody)
  })

  it('should generate a collision event', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity1 = createEntity(world)
    const entity2 = createEntity(world)

    addComponent(entity1, CollisionComponent, new Map())
    addComponent(entity2, CollisionComponent, new Map())

    setTransformComponent(entity1)
    setTransformComponent(entity2)

    const collisionEventQueue = Physics.createCollisionEventQueue()
    const drainCollisions = Physics.drainCollisionEventQueue(physicsWorld)

    const rigidBodyDesc = RigidBodyDesc.dynamic()
    const colliderDesc = ColliderDesc.ball(1)
      .setCollisionGroups(getInteractionGroups(CollisionGroups.Default, DefaultCollisionMask))
      .setActiveCollisionTypes(ActiveCollisionTypes.ALL)
      .setActiveEvents(ActiveEvents.COLLISION_EVENTS)

    const rigidBody1 = Physics.createRigidBody(entity1, physicsWorld, rigidBodyDesc, [colliderDesc])
    const rigidBody2 = Physics.createRigidBody(entity2, physicsWorld, rigidBodyDesc, [colliderDesc])

    physicsWorld.step(collisionEventQueue)
    collisionEventQueue.drainCollisionEvents(drainCollisions)

    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodySelf, rigidBody1)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodyOther, rigidBody2)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeSelf, rigidBody1.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeOther, rigidBody2.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.type, CollisionEvents.COLLISION_START)

    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodySelf, rigidBody2)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodyOther, rigidBody1)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeSelf, rigidBody2.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeOther, rigidBody1.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.type, CollisionEvents.COLLISION_START)

    rigidBody2.setTranslation({ x: 0, y: 0, z: 15 }, true)

    physicsWorld.step(collisionEventQueue)
    collisionEventQueue.drainCollisionEvents(drainCollisions)

    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodySelf, rigidBody1)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodyOther, rigidBody2)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeSelf, rigidBody1.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeOther, rigidBody2.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.type, CollisionEvents.COLLISION_END)

    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodySelf, rigidBody2)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodyOther, rigidBody1)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeSelf, rigidBody2.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeOther, rigidBody1.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.type, CollisionEvents.COLLISION_END)
  })

  it('should generate a trigger event', async () => {
    const world = Engine.instance.currentWorld
    const physicsWorld = world.physicsWorld

    const entity1 = createEntity(world)
    const entity2 = createEntity(world)

    addComponent(entity1, CollisionComponent, new Map())
    addComponent(entity2, CollisionComponent, new Map())

    setTransformComponent(entity1)
    setTransformComponent(entity2)

    const collisionEventQueue = Physics.createCollisionEventQueue()
    const drainCollisions = Physics.drainCollisionEventQueue(physicsWorld)

    const rigidBodyDesc = RigidBodyDesc.dynamic()
    const colliderDesc = ColliderDesc.ball(1)
      .setCollisionGroups(getInteractionGroups(CollisionGroups.Default, DefaultCollisionMask))
      .setActiveCollisionTypes(ActiveCollisionTypes.ALL)
      .setActiveEvents(ActiveEvents.COLLISION_EVENTS)
      .setSensor(true)

    const rigidBody1 = Physics.createRigidBody(entity1, physicsWorld, rigidBodyDesc, [colliderDesc])
    const rigidBody2 = Physics.createRigidBody(entity2, physicsWorld, rigidBodyDesc, [colliderDesc])

    physicsWorld.step(collisionEventQueue)
    collisionEventQueue.drainCollisionEvents(drainCollisions)

    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodySelf, rigidBody1)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodyOther, rigidBody2)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeSelf, rigidBody1.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeOther, rigidBody2.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.type, CollisionEvents.TRIGGER_START)

    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodySelf, rigidBody2)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodyOther, rigidBody1)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeSelf, rigidBody2.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeOther, rigidBody1.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.type, CollisionEvents.TRIGGER_START)

    rigidBody2.setTranslation({ x: 0, y: 0, z: 15 }, true)

    physicsWorld.step(collisionEventQueue)
    collisionEventQueue.drainCollisionEvents(drainCollisions)

    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodySelf, rigidBody1)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.bodyOther, rigidBody2)
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeSelf, rigidBody1.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.shapeOther, rigidBody2.collider(0))
    assert.equal(getComponent(entity1, CollisionComponent).get(entity2)?.type, CollisionEvents.TRIGGER_END)

    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodySelf, rigidBody2)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.bodyOther, rigidBody1)
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeSelf, rigidBody2.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.shapeOther, rigidBody1.collider(0))
    assert.equal(getComponent(entity2, CollisionComponent).get(entity1)?.type, CollisionEvents.TRIGGER_END)
  })
})
