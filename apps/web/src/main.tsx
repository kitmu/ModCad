import { createRoot } from "react-dom/client";
import { Workspace } from "./routes/Workspace.js";
import { IntlProvider } from "./i18n/IntlProvider.js";
import { ThemeRoot } from "./settings/ThemeRoot.js";
import "./styles/globals.css";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <IntlProvider>
      <ThemeRoot>
        <Workspace />
      </ThemeRoot>
    </IntlProvider>,
  );
}
