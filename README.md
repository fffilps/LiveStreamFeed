# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


In the app, create/resume today’s live stream and copy the stream key (and make sure you’re not sharing it publicly).

In local.env, set the key (uncomment the line and paste the value):

MUX_STREAM_KEY=your-actual-stream-key
If the wrong camera/mic is used, list devices and set indexes:

ffmpeg -f avfoundation -list_devices true -i ""
Then, for example:

export MUX_AVFOUNDATION_VIDEO=0
export MUX_AVFOUNDATION_AUDIO=1
From the repo root, start the stream:

npm run stream:camera
In the app, use Retry connection (or open the Mux player) so playback picks up once Mux shows the stream as active.