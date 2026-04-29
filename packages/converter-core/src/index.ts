export type {
  FsLike,
  FsDirEntry,
  GameContextRef,
  DiscoveredFile,
  ScanResult,
  DiffPlan,
  DiffOptions,
  CopyAction,
  CopyPlan,
  ApplyReport,
  ApplyOptions,
  ProgressEvent
} from './types.js'

export { scan } from './scan.js'
export { diff } from './diff.js'
export { plan, type PlanOptions } from './plan.js'
export { apply } from './apply.js'
export {
  posixJoin,
  posixDirname,
  posixBasename,
  posixSplit,
  posixNormalize,
  posixNormalizeStrict,
  posixContains
} from './path.js'
