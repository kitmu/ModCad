import { createRoot } from "react-dom/client";
import { Workspace } from "./routes/Workspace.js";
import "./styles/globals.css";

const el = document.getElementById("root");
if (el) createRoot(el).render(<Workspace />);
