import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Local preview + MediaStream for camera/screen + microphone.
 *
 * Mux Live ingest is RTMP/SRT — browsers do not push RTMP directly. Use this UI to pick
 * devices and preview; send to Mux with OBS, Streamlabs, or a server relay (WebRTC→RTMP).
 *
 * @param {(stream: MediaStream | null) => void} [props.onStreamReady] latest combined stream, or null when torn down
 * @param {string} [props.className]
 */
export default function StreamPublisher({ onStreamReady, className = '' }) {
  const videoRef = useRef(null)
  /** Holds screen + mic or camera+mic — stop every track when replacing */
  const activeStreamRef = useRef(null)
  const mountedRef = useRef(true)
  const onStreamReadyRef = useRef(onStreamReady)

  useEffect(() => {
    onStreamReadyRef.current = onStreamReady
  }, [onStreamReady])

  const [devicesReady, setDevicesReady] = useState(false)
  const [cameras, setCameras] = useState([])
  const [mics, setMics] = useState([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicId, setSelectedMicId] = useState('')
  /** @type {'camera' | 'screen'} */
  const [videoSource, setVideoSource] = useState('camera')
  const [mediaError, setMediaError] = useState(null)

  const stopActiveStream = useCallback(() => {
    activeStreamRef.current?.getTracks().forEach((t) => t.stop())
    activeStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (mountedRef.current) onStreamReadyRef.current?.(null)
  }, [])

  const refreshDeviceLists = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setCameras(devices.filter((d) => d.kind === 'videoinput'))
      setMics(devices.filter((d) => d.kind === 'audioinput'))
    } catch {
      // non-fatal (labels may stay empty without permission)
    }
  }, [])

  /** One-time permission so device labels appear (best effort). */
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function primePermissionsAndDevices() {
      setMediaError(null)
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          temp.getTracks().forEach((t) => t.stop())
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setMediaError(
            `Camera/mic permission: ${msg}. You may still try screen capture below.`,
          )
        }
      } finally {
        if (!cancelled) {
          await refreshDeviceLists()
          setDevicesReady(true)
        }
      }
    }

    void primePermissionsAndDevices()

    const onDeviceChange = () => {
      void refreshDeviceLists()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange)

    return () => {
      cancelled = true
      mountedRef.current = false
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange)
      stopActiveStream()
    }
  }, [refreshDeviceLists, stopActiveStream])

  useEffect(() => {
    if (!devicesReady || typeof navigator === 'undefined') return

    let cancelled = false

    async function buildStream() {
      setMediaError(null)
      try {
        if (videoSource === 'screen') {
          const display = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          })
          if (cancelled) {
            display.getTracks().forEach((t) => t.stop())
            return
          }

          const videoTrack = display.getVideoTracks()[0]
          if (videoTrack) {
            videoTrack.addEventListener('ended', () => {
              if (mountedRef.current) setVideoSource('camera')
            })
          }

          const mic = await navigator.mediaDevices.getUserMedia({
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
            video: false,
          })
          if (cancelled) {
            display.getTracks().forEach((t) => t.stop())
            mic.getTracks().forEach((t) => t.stop())
            return
          }

          const combined = new MediaStream([
            ...display.getVideoTracks(),
            ...mic.getAudioTracks(),
          ])
          activeStreamRef.current = combined
          if (videoRef.current) videoRef.current.srcObject = combined
          onStreamReadyRef.current?.(combined)
          return
        }

        const constraints = {
          video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
          audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        activeStreamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        onStreamReadyRef.current?.(stream)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!cancelled) setMediaError(msg)
      }
    }

    void buildStream()

    return () => {
      cancelled = true
      stopActiveStream()
    }
  }, [devicesReady, videoSource, selectedCameraId, selectedMicId, stopActiveStream])

  const disableCameraControls = videoSource === 'screen'

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-4 text-sm">
        <fieldset className="min-w-[200px] space-y-1">
          <legend className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Video source
          </legend>
          <label className="mr-3 cursor-pointer">
            <input
              type="radio"
              name="mux-video-src"
              checked={videoSource === 'camera'}
              onChange={() => setVideoSource('camera')}
              className="mr-1 align-middle"
            />
            Camera
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="mux-video-src"
              checked={videoSource === 'screen'}
              onChange={() => setVideoSource('screen')}
              className="mr-1 align-middle"
            />
            Screen / window
          </label>
        </fieldset>

        <label className={`flex flex-col gap-0.5 ${disableCameraControls ? 'opacity-40' : ''}`}>
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Camera</span>
          <select
            value={selectedCameraId}
            disabled={disableCameraControls}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="max-w-[240px] rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-900"
          >
            <option value="">Default</option>
            {cameras.map((cam, i) => (
              <option key={cam.deviceId || `cam-${i}`} value={cam.deviceId}>
                {cam.label || `Camera ${cam.deviceId?.slice(0, 8) ?? ''}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Microphone
          </span>
          <select
            value={selectedMicId}
            onChange={(e) => setSelectedMicId(e.target.value)}
            className="max-w-[240px] rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-900"
          >
            <option value="">Default</option>
            {mics.map((mic, i) => (
              <option key={mic.deviceId || `mic-${i}`} value={mic.deviceId}>
                {mic.label || `Mic ${mic.deviceId?.slice(0, 8) ?? ''}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mediaError ? (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
          {mediaError}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200 bg-black dark:border-neutral-700">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full max-w-3xl object-contain"
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
        Screen capture: your browser will ask which display or window to share. Stopping share
        switches back to camera mode.
      </p>
    </div>
  )
}
