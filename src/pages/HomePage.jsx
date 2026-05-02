import LiveStreamCreator from '../Components/LiveStreamCreator'

export default function HomePage() {
  return (
    <>
      <h1 className="text-3xl font-bold underline">Hello World</h1>
      <div className="mx-auto my-10 w-full max-w-7xl px-4">
        <LiveStreamCreator />
      </div>
    </>
  )
}
