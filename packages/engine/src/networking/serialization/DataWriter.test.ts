import { strictEqual } from 'assert'
import { Group, Quaternion, Vector3 } from 'three'

import { NetworkId } from '@xrengine/common/src/interfaces/NetworkId'
import { UserId } from '@xrengine/common/src/interfaces/UserId'

import { roundNumberToPlaces } from '../../common/functions/roundVector'
import { createQuaternionProxy, createVector3Proxy } from '../../common/proxies/three'
import { Engine } from '../../ecs/classes/Engine'
import { Entity } from '../../ecs/classes/Entity'
import { addComponent } from '../../ecs/functions/ComponentFunctions'
import { createEntity } from '../../ecs/functions/EntityFunctions'
import { createEngine } from '../../initializeEngine'
import { TransformComponent } from '../../transform/components/TransformComponent'
import { XRHandsInputComponent } from '../../xr/components/XRHandsInputComponent'
import { XRHandBones } from '../../xr/types/XRHandBones'
import { NetworkObjectComponent } from '../components/NetworkObjectComponent'
import { readRotation } from './DataReader'
import {
  createDataWriter,
  writeComponent,
  writeEntities,
  writeEntity,
  writePosition,
  writeRotation,
  writeTransform,
  writeVector3,
  writeXRHands
} from './DataWriter'
import { createViewCursor, readFloat32, readUint8, readUint16, readUint32, sliceViewCursor } from './ViewCursor'

describe('DataWriter', () => {
  before(() => {
    createEngine()
  })

  it('should writeComponent', () => {
    const writeView = createViewCursor()
    const entity = 42 as Entity
    Engine.instance.currentWorld.fixedTick = 1

    const [x, y, z] = [1.5, 2.5, 3.5]
    TransformComponent.position.x[entity] = x
    TransformComponent.position.y[entity] = y
    TransformComponent.position.z[entity] = z

    const writePosition = writeComponent(TransformComponent.position)

    writePosition(writeView, entity)

    const testView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 1 * Uint8Array.BYTES_PER_ELEMENT + 3 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(testView), 0b111)
    strictEqual(readFloat32(testView), x)
    strictEqual(readFloat32(testView), y)
    strictEqual(readFloat32(testView), z)

    sliceViewCursor(writeView)

    TransformComponent.position.x[entity]++
    TransformComponent.position.z[entity]++

    writePosition(writeView, entity)

    const readView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 1 * Uint8Array.BYTES_PER_ELEMENT + 2 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(readView), 0b101)
    strictEqual(readFloat32(readView), x + 1)
    strictEqual(readFloat32(readView), z + 1)
  })

  it('should writeVector3', () => {
    const writeView = createViewCursor()
    const entity = 42 as Entity

    const [x, y, z] = [1.5, 2.5, 3.5]
    TransformComponent.position.x[entity] = x
    TransformComponent.position.y[entity] = y
    TransformComponent.position.z[entity] = z

    writeVector3(TransformComponent.position)(writeView, entity)

    const testView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 1 * Uint8Array.BYTES_PER_ELEMENT + 3 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(testView), 0b111)
    strictEqual(readFloat32(testView), x)
    strictEqual(readFloat32(testView), y)
    strictEqual(readFloat32(testView), z)

    sliceViewCursor(writeView)

    TransformComponent.position.x[entity]++
    TransformComponent.position.z[entity]++

    writeVector3(TransformComponent.position)(writeView, entity)

    const readView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 1 * Uint8Array.BYTES_PER_ELEMENT + 2 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(readView), 0b101)
    strictEqual(readFloat32(readView), x + 1)
    strictEqual(readFloat32(readView), z + 1)
  })

  it('should writePosition', () => {
    const writeView = createViewCursor()
    const entity = 42 as Entity

    const [x, y, z] = [1.5, 2.5, 3.5]
    TransformComponent.position.x[entity] = x
    TransformComponent.position.y[entity] = y
    TransformComponent.position.z[entity] = z

    writePosition(writeView, entity)

    const readView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 1 * Uint8Array.BYTES_PER_ELEMENT + 3 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(readView), 0b111)
    strictEqual(readFloat32(readView), x)
    strictEqual(readFloat32(readView), y)
    strictEqual(readFloat32(readView), z)
  })

  it('should writeCompressedRotation', () => {
    const writeView = createViewCursor()
    const entity = 42 as Entity

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [x, y, z, w] = [a, b, c, d]
    TransformComponent.rotation.x[entity] = x
    TransformComponent.rotation.y[entity] = y
    TransformComponent.rotation.z[entity] = z
    TransformComponent.rotation.w[entity] = w

    writeRotation(writeView, entity)

    const readView = createViewCursor(writeView.buffer)
    readRotation(readView, entity)

    strictEqual(readView.cursor, Uint8Array.BYTES_PER_ELEMENT + Float32Array.BYTES_PER_ELEMENT)

    // Round values to 3 decimal places and compare
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entity], 3), roundNumberToPlaces(x, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entity], 3), roundNumberToPlaces(y, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entity], 3), roundNumberToPlaces(z, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entity], 3), roundNumberToPlaces(w, 3))
  })

  it('should writeTransform', () => {
    const writeView = createViewCursor()
    const entity = createEntity()

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [posX, posY, posZ] = [1.5, 2.5, 3.5]
    const [rotX, rotY, rotZ, rotW] = [a, b, c, d]

    addComponent(entity, TransformComponent, {
      position: createVector3Proxy(TransformComponent.position, entity).set(posX, posY, posZ),
      rotation: createQuaternionProxy(TransformComponent.rotation, entity).set(rotX, rotY, rotZ, rotW),
      scale: new Vector3(1, 1, 1)
    })

    writeTransform(writeView, entity)

    const readView = createViewCursor(writeView.buffer)

    strictEqual(writeView.cursor, 3 * Uint8Array.BYTES_PER_ELEMENT + 4 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(readUint8(readView), 0b11)

    strictEqual(readUint8(readView), 0b111)

    strictEqual(readFloat32(readView), posX)
    strictEqual(readFloat32(readView), posY)
    strictEqual(readFloat32(readView), posZ)

    readRotation(readView, entity)

    // Round values to 3 decimal places and compare
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entity], 3), roundNumberToPlaces(rotX, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entity], 3), roundNumberToPlaces(rotY, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entity], 3), roundNumberToPlaces(rotZ, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entity], 3), roundNumberToPlaces(rotW, 3))
  })

  it('should writeXRHands', () => {
    const writeView = createViewCursor()
    const entity = createEntity()

    let joints = []
    XRHandBones.forEach((bone) => {
      joints = joints.concat(bone as any)
    })

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [posX, posY, posZ] = [1.5, 2.5, 3.5]
    const [rotX, rotY, rotZ, rotW] = [a, b, c, d]

    const hands = [new Group(), new Group()]
    hands[0].userData.handedness = 'left'
    hands[1].userData.handedness = 'right'

    hands.forEach((hand) => {
      // setup mock hand state
      const handedness = hand.userData.handedness
      const dummyXRHandMeshModel = new Group() as any
      dummyXRHandMeshModel.handedness = handedness
      hand.userData.mesh = dummyXRHandMeshModel

      // proxify and copy values
      joints.forEach((jointName) => {
        createVector3Proxy(XRHandsInputComponent[handedness][jointName].position, entity).set(posX, posY, posZ)
        createQuaternionProxy(XRHandsInputComponent[handedness][jointName].quaternion, entity).set(
          rotX,
          rotY,
          rotZ,
          rotW
        )
      })
    })

    // add component
    const xrHandsInput = addComponent(entity, XRHandsInputComponent, { hands: hands })

    writeXRHands(writeView, entity)

    const readView = createViewCursor(writeView.buffer)

    // ChangeMask details
    // For each entity
    // 1 - changeMask (uint16) for writeXRHands
    // For each hand
    // 1 - changeMask (uint16) for each hand
    // 1 - changeMask (uint8) for each hand handedness
    // 6 - changeMask (uint16) for each hand bone
    // 2 - changeMask (uint8) for pos and rot of each joint
    const numOfHands = hands.length
    const numOfJoints = joints.length
    strictEqual(
      writeView.cursor,
      1 * Uint16Array.BYTES_PER_ELEMENT +
        (1 * Uint16Array.BYTES_PER_ELEMENT +
          1 * Uint8Array.BYTES_PER_ELEMENT +
          6 * Uint16Array.BYTES_PER_ELEMENT +
          (2 * Uint8Array.BYTES_PER_ELEMENT + 4 * Float32Array.BYTES_PER_ELEMENT) * numOfJoints) *
          numOfHands
    )

    strictEqual(readUint16(readView), 0b11)

    hands.forEach((hand) => {
      const handedness = hand.userData.handedness
      const handednessBitValue = handedness === 'left' ? 0 : 1

      readUint16(readView)
      // strictEqual(readUint16(readView), 0b111111)
      strictEqual(readUint8(readView), handednessBitValue)

      XRHandBones.forEach((bone) => {
        readUint16(readView)
        // strictEqual(readUint16(readView), 0b11)

        bone.forEach((joint) => {
          strictEqual(readUint8(readView), 0b111)
          strictEqual(readFloat32(readView), posX)
          strictEqual(readFloat32(readView), posY)
          strictEqual(readFloat32(readView), posZ)

          readRotation(readView, entity)

          // Round values to 3 decimal places and compare
          strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entity], 3), roundNumberToPlaces(rotX, 3))
          strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entity], 3), roundNumberToPlaces(rotY, 3))
          strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entity], 3), roundNumberToPlaces(rotZ, 3))
          strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entity], 3), roundNumberToPlaces(rotW, 3))
        })
      })
    })
  })

  it('should writeEntity with only TransformComponent', () => {
    const writeView = createViewCursor()
    const entity = createEntity()
    const networkId = 999 as NetworkId
    const userId = '0' as UserId
    const userIndex = 0

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [posX, posY, posZ] = [1.5, 2.5, 3.5]
    const [rotX, rotY, rotZ, rotW] = [a, b, c, d]

    addComponent(entity, TransformComponent, {
      position: createVector3Proxy(TransformComponent.position, entity).set(posX, posY, posZ),
      rotation: createQuaternionProxy(TransformComponent.rotation, entity).set(rotX, rotY, rotZ, rotW),
      scale: new Vector3(1, 1, 1)
    })

    addComponent(entity, NetworkObjectComponent, {
      networkId,
      ownerId: userId,
      prefab: '',
      parameters: {}
    })

    NetworkObjectComponent.networkId[entity] = networkId

    writeEntity(writeView, networkId, entity)

    const readView = createViewCursor(writeView.buffer)

    strictEqual(
      writeView.cursor,
      1 * Uint32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT + 4 * Float32Array.BYTES_PER_ELEMENT
    )

    // read networkId
    strictEqual(readUint32(readView), networkId)

    // read writeEntity changeMask (only reading TransformComponent)
    strictEqual(readUint8(readView), 0b01)

    // read writeTransform changeMask
    strictEqual(readUint8(readView), 0b11)

    // read writePosition changeMask
    strictEqual(readUint8(readView), 0b111)

    // read position values
    strictEqual(readFloat32(readView), posX)
    strictEqual(readFloat32(readView), posY)
    strictEqual(readFloat32(readView), posZ)

    // read rotation values
    readRotation(readView, entity)

    // Round values to 3 decimal places and compare
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entity], 3), roundNumberToPlaces(rotX, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entity], 3), roundNumberToPlaces(rotY, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entity], 3), roundNumberToPlaces(rotZ, 3))
    strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entity], 3), roundNumberToPlaces(rotW, 3))
  })

  it('should writeEntities', () => {
    const writeView = createViewCursor()

    const n = 5
    const entities: Entity[] = Array(n)
      .fill(0)
      .map(() => createEntity())

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [posX, posY, posZ] = [1.5, 2.5, 3.5]
    const [rotX, rotY, rotZ, rotW] = [a, b, c, d]

    entities.forEach((entity) => {
      const networkId = entity as unknown as NetworkId
      const userId = entity as unknown as UserId
      const userIndex = entity
      NetworkObjectComponent.networkId[entity] = networkId
      addComponent(entity, TransformComponent, {
        position: createVector3Proxy(TransformComponent.position, entity).set(posX, posY, posZ),
        rotation: createQuaternionProxy(TransformComponent.rotation, entity).set(rotX, rotY, rotZ, rotW),
        scale: new Vector3(1, 1, 1)
      })
      addComponent(entity, NetworkObjectComponent, {
        networkId,
        ownerId: userId,
        prefab: '',
        parameters: {}
      })
    })

    writeEntities(writeView, entities)
    const packet = sliceViewCursor(writeView)

    const expectedBytes =
      1 * Uint32Array.BYTES_PER_ELEMENT +
      n * (1 * Uint32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT + 4 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(writeView.cursor, 0)
    strictEqual(packet.byteLength, expectedBytes)

    const readView = createViewCursor(writeView.buffer)

    const count = readUint32(readView)
    strictEqual(count, entities.length)

    for (let i = 0; i < count; i++) {
      // read networkId
      strictEqual(readUint32(readView), entities[i])

      // read writeEntity changeMask (only reading TransformComponent)
      strictEqual(readUint8(readView), 0b01)

      // read writeTransform changeMask
      strictEqual(readUint8(readView), 0b11)

      // read writePosition changeMask
      strictEqual(readUint8(readView), 0b111)

      // read position values
      strictEqual(readFloat32(readView), posX)
      strictEqual(readFloat32(readView), posY)
      strictEqual(readFloat32(readView), posZ)

      // read rotation values
      readRotation(readView, entities[i])

      // Round values to 3 decimal places and compare
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entities[i]], 3), roundNumberToPlaces(rotX, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entities[i]], 3), roundNumberToPlaces(rotY, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entities[i]], 3), roundNumberToPlaces(rotZ, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entities[i]], 3), roundNumberToPlaces(rotW, 3))
    }
  })

  it('should createDataWriter', () => {
    const world = Engine.instance.currentWorld

    const write = createDataWriter()

    const n = 50
    const entities: Entity[] = Array(n)
      .fill(0)
      .map(() => createEntity())

    // construct values for a valid quaternion
    const [a, b, c] = [0.167, 0.167, 0.167]
    let d = Math.sqrt(1 - (a * a + b * b + c * c))

    const [posX, posY, posZ] = [1.5, 2.5, 3.5]
    const [rotX, rotY, rotZ, rotW] = [a, b, c, d]

    entities.forEach((entity) => {
      const networkId = entity as unknown as NetworkId
      const userId = entity as unknown as UserId
      const userIndex = entity
      NetworkObjectComponent.networkId[entity] = networkId
      addComponent(entity, TransformComponent, {
        position: createVector3Proxy(TransformComponent.position, entity).set(posX, posY, posZ),
        rotation: createQuaternionProxy(TransformComponent.rotation, entity).set(rotX, rotY, rotZ, rotW),
        scale: new Vector3(1, 1, 1)
      })
      addComponent(entity, NetworkObjectComponent, {
        networkId,
        ownerId: userId,
        prefab: '',
        parameters: {}
      })
    })

    const packet = write(world, entities)

    const expectedBytes =
      3 * Uint32Array.BYTES_PER_ELEMENT +
      n * (1 * Uint32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT + 4 * Float32Array.BYTES_PER_ELEMENT)

    strictEqual(packet.byteLength, expectedBytes)

    const readView = createViewCursor(packet)

    const tick = readUint32(readView)
    const userIndex = readUint32(readView)

    const count = readUint32(readView)
    strictEqual(count, entities.length)

    for (let i = 0; i < count; i++) {
      // read networkId
      strictEqual(readUint32(readView), entities[i])

      // read writeEntity changeMask (only reading TransformComponent)
      strictEqual(readUint8(readView), 0b01)

      // read writeTransform changeMask
      strictEqual(readUint8(readView), 0b11)

      // read writePosition changeMask
      strictEqual(readUint8(readView), 0b111)

      // read position values
      strictEqual(readFloat32(readView), posX)
      strictEqual(readFloat32(readView), posY)
      strictEqual(readFloat32(readView), posZ)

      // read rotation values
      readRotation(readView, entities[i])

      // Round values to 3 decimal places and compare
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.x[entities[i]], 3), roundNumberToPlaces(rotX, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.y[entities[i]], 3), roundNumberToPlaces(rotY, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.z[entities[i]], 3), roundNumberToPlaces(rotZ, 3))
      strictEqual(roundNumberToPlaces(TransformComponent.rotation.w[entities[i]], 3), roundNumberToPlaces(rotW, 3))
    }
  })
})
