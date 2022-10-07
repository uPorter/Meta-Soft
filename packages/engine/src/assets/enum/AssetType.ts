/** List of Asset Types. */
export enum AssetType {
  XRE = 'xre.gltf',
  glB = 'glb',
  glTF = 'gltf',
  FBX = 'fbx',
  OBJ = 'obj',
  VRM = 'vrm',
  PNG = 'png',
  JPEG = 'jpeg',
  TGA = 'tga',
  MP4 = 'mp4',
  TS = 'ts',
  MKV = 'mkv',
  MP3 = 'mp3',
  OGG = 'ogg',
  M4A = 'm4a',
  AAC = 'acc',
  CSV = 'csv',
  PlainText = 'text',
  DOC = 'doc',
  XLS = 'xls',
  Script = 'script'
}

export const precacheSupport = Object.freeze({
  [AssetType.XRE]: false,
  [AssetType.glB]: true,
  [AssetType.glTF]: true,
  [AssetType.FBX]: true,
  [AssetType.OBJ]: true,
  [AssetType.VRM]: true,
  [AssetType.PNG]: true,
  [AssetType.JPEG]: true,
  [AssetType.TGA]: true,
  [AssetType.MP4]: false,
  [AssetType.TS]: true,
  [AssetType.MKV]: false,
  [AssetType.MP3]: false,
  [AssetType.OGG]: false,
  [AssetType.M4A]: false,
  [AssetType.AAC]: false,
  [AssetType.CSV]: true,
  [AssetType.PlainText]: true,
  [AssetType.DOC]: true,
  [AssetType.XLS]: true,
  [AssetType.Script]: true
})