import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import useViewer from '../../store/use-viewer'

const PERSPECTIVE_CAMERA_NEAR = 0.25
const EDITOR_CAMERA_FAR = 10000

export const ViewerCamera = () => {
  const cameraMode = useViewer((state) => state.cameraMode)

  return cameraMode === 'perspective' ? (
    <PerspectiveCamera
      far={EDITOR_CAMERA_FAR}
      fov={50}
      makeDefault
      near={PERSPECTIVE_CAMERA_NEAR}
      position={[10, 10, 10]}
    />
  ) : (
    <OrthographicCamera
      far={EDITOR_CAMERA_FAR}
      makeDefault
      near={-EDITOR_CAMERA_FAR}
      position={[10, 10, 10]}
      zoom={20}
    />
  )
}
