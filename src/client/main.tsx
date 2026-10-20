import { render } from "preact";
import "./styles.css";
import { App } from "./App";
import { Legal } from "./Legal";
import { fetchMe } from "./api";

function reveal() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  requestAnimationFrame(() => {
    boot.classList.add("done");
    boot.removeAttribute("aria-busy");
    setTimeout(() => boot.remove(), 500);
  });
}

async function start() {
  const root = document.getElementById("app")!;
  const legal = location.pathname.match(/^\/legal\/(terms|privacy|tokushoho)$/);
  if (legal) {
    render(<Legal page={legal[1]} />, root);
  } else {
    const me = await fetchMe();
    render(<App initialMe={me} />, root);
  }
  reveal();
}

void start();

// ホーム画面への追加とオフライン表示のための Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
