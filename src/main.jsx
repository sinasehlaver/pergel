import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { config } from "./config.js";
import { setupLook } from "look/kit/setup.js";
import "look/tokens.css";
import "look/kit.css";

// tokens + kit + Settings → Appearance come from the `look` package (vendored in vendor/look)
setupLook(config);
createRoot(document.getElementById("root")).render(<App />);
