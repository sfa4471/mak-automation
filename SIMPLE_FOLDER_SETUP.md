# Simple folder setup — one URL, no extra setup

You send your client **crestfield.app**. They use it in the browser. They choose a folder once. Done.

---

## How it works

1. **Client opens** https://www.crestfield.app and logs in.
2. **Client goes to** Settings → **Project Folder Location**.
3. **Client clicks** **"Choose folder"** (Chrome or Edge).
4. **Client picks** a folder on their computer (e.g. their OneDrive or Desktop).
5. **That’s it.** No server path, no backend on their PC, no database field to configure.

From then on:

- **New projects** → a project folder is created in the chosen folder (in the browser).
- **PDFs** (Density, Rebar, WP1, Proctor) → when they click Download PDF, the file is also saved into the chosen folder (in the right project subfolder).

Everything happens in the browser on their device. Your backend (e.g. on Render) stays as it is.

---

## Browser support

- **Chrome** and **Edge** support the folder picker.
- **Firefox / Safari** do not. On those browsers they’ll see a message and can use the **Advanced** option (enter a path) only if they run the backend on their own computer.

---

## For you

- Keep using **one crestfield.app** URL.
- No need to run the backend on the client’s machine for this flow.
- The “Advanced: enter path” section in Settings is only for the old flow (backend on their PC). Most users can ignore it.
