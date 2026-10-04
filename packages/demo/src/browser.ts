// Nova — Chrome-style tabbed browser UI built on Scramjet.
import {
	CatchEscapedLinksPlugin,
	UrlWatcherPlugin,
} from "@mercuryworkshop/scramjet-utils";
import { cachePlugin, controller } from ".";

export const BROWSER_NAME = "Nova";
const SEARCH = "https://duckduckgo.com/?q=";

type Tab = {
	id: number;
	frame: any;
	iframe: HTMLIFrameElement;
	tabEl: HTMLDivElement;
	titleEl: HTMLSpanElement;
	url: string;
	title: string;
};

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#202124;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8eaed;overflow:hidden}
#nova{display:flex;flex-direction:column;height:100vh}
.tabstrip{display:flex;align-items:flex-end;gap:2px;padding:8px 8px 0;background:#202124;min-height:42px;overflow-x:auto;scrollbar-width:none}
.tab{display:flex;align-items:center;gap:8px;min-width:60px;max-width:220px;flex:1 1 220px;height:34px;padding:0 8px 0 12px;border-radius:10px 10px 0 0;background:transparent;color:#bdc1c6;font-size:12.5px;cursor:default;user-select:none}
.tab:hover{background:#2a2b2e}
.tab.active{background:#35363a;color:#fff}
.tab .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tab .x{border:0;background:transparent;color:inherit;width:20px;height:20px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1}
.tab .x:hover{background:#4a4b4f}
.newtab{border:0;background:transparent;color:#bdc1c6;width:30px;height:30px;margin:0 0 2px 4px;border-radius:50%;font-size:20px;cursor:pointer;flex:none}
.newtab:hover{background:#35363a}
.toolbar{display:flex;align-items:center;gap:4px;padding:6px 8px;background:#35363a;border-bottom:1px solid #4a4b4f}
.toolbar button{border:0;background:transparent;color:#c4c7c5;width:32px;height:32px;border-radius:50%;font-size:17px;cursor:pointer;flex:none}
.toolbar button:hover{background:#4a4b4f}
.omni{flex:1;min-width:0}
.omni input{width:100%;height:34px;border:0;border-radius:17px;padding:0 16px;background:#202124;color:#e8eaed;font-size:14px;outline:none}
.omni input:focus{box-shadow:0 0 0 2px #8ab4f8}
.views{flex:1;position:relative;background:#fff}
.views iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:#fff}
.views iframe.active{display:block}
`;

function newTabPage(): string {
	return `<!doctype html><html><head><meta charset="utf-8"><title>New Tab</title>
<style>body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#202124;font-family:system-ui,sans-serif;color:#e8eaed}
h1{font-size:64px;font-weight:600;margin:0 0 28px;letter-spacing:-2px;background:linear-gradient(90deg,#8ab4f8,#c58af9);-webkit-background-clip:text;color:transparent}
form{width:min(580px,90vw)}input{width:100%;height:48px;border-radius:24px;border:1px solid #5f6368;background:#303134;color:#e8eaed;padding:0 22px;font-size:16px;outline:none}
input:focus{border-color:#8ab4f8}</style></head><body>
<h1>${BROWSER_NAME}</h1>
<form onsubmit="event.preventDefault();parent.postMessage({novaGo:this.q.value},'*')"><input name="q" autofocus placeholder="Search or type a URL"></form>
</body></html>`;
}

function toUrl(input: string): string {
	const s = input.trim();
	if (!s) return "";
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(s)) return s;
	if (/^[^\s]+\.[a-z]{2,}(\/.*)?$/i.test(s) || s.startsWith("localhost"))
		return "https://" + s;
	return SEARCH + encodeURIComponent(s);
}

export function mountBrowser(root: HTMLElement) {
	document.title = BROWSER_NAME;
	const style = document.createElement("style");
	style.textContent = CSS;
	document.head.append(style);

	root.id = "nova";
	root.innerHTML = `
		<div class="tabstrip"><button class="newtab" title="New tab">+</button></div>
		<div class="toolbar">
			<button data-a="back" title="Back">&#8592;</button>
			<button data-a="fwd" title="Forward">&#8594;</button>
			<button data-a="reload" title="Reload">&#8635;</button>
			<button data-a="home" title="Home">&#8962;</button>
			<form class="omni"><input spellcheck="false" placeholder="Search or type a URL"></form>
		</div>
		<div class="views"></div>`;

	const strip = root.querySelector(".tabstrip") as HTMLDivElement;
	const plus = root.querySelector(".newtab") as HTMLButtonElement;
	const views = root.querySelector(".views") as HTMLDivElement;
	const omniForm = root.querySelector(".omni") as HTMLFormElement;
	const omni = omniForm.querySelector("input") as HTMLInputElement;

	const tabs: Tab[] = [];
	let active: Tab | null = null;
	let nextId = 1;

	const label = (t: Tab) => {
		t.titleEl.textContent = t.title || t.url || "New Tab";
		t.tabEl.title = t.titleEl.textContent!;
	};

	const readTitle = (t: Tab) => {
		try {
			const d = t.iframe.contentDocument;
			if (d && d.title) {
				t.title = d.title;
				label(t);
			}
		} catch {}
	};

	function activate(t: Tab) {
		active = t;
		for (const x of tabs) {
			x.tabEl.classList.toggle("active", x === t);
			x.iframe.classList.toggle("active", x === t);
		}
		omni.value = t.url;
		if (!t.url) omni.focus();
	}

	function openTab(url?: string) {
		const iframe = document.createElement("iframe");
		views.append(iframe);

		const tabEl = document.createElement("div");
		tabEl.className = "tab";
		const titleEl = document.createElement("span");
		titleEl.className = "t";
		const x = document.createElement("button");
		x.className = "x";
		x.textContent = "×";
		tabEl.append(titleEl, x);
		strip.insertBefore(tabEl, plus);

		const t: Tab = { id: nextId++, frame: null, iframe, tabEl, titleEl, url: "", title: "New Tab" };

		const watcher = new UrlWatcherPlugin((u: string) => {
			t.url = u;
			t.title = "";
			label(t);
			if (active === t && document.activeElement !== omni) omni.value = u;
			setTimeout(() => readTitle(t), 800);
			setTimeout(() => readTitle(t), 3000);
		});
		const escaped = new CatchEscapedLinksPlugin(
			(u: URL) => new URL(`/?goto=${encodeURIComponent(u.href)}`, location.origin)
		);
		t.frame = controller.createFrame(iframe, {
			plugins: [cachePlugin, watcher, escaped],
		});
		iframe.addEventListener("load", () => readTitle(t));

		tabEl.addEventListener("mousedown", (e) => {
			if (e.target !== x) activate(t);
		});
		tabEl.addEventListener("auxclick", (e) => {
			if (e.button === 1) closeTab(t);
		});
		x.addEventListener("click", () => closeTab(t));

		tabs.push(t);
		if (url) {
			t.url = url;
			t.frame.go(url);
		} else {
			iframe.src = "data:text/html;base64," + btoa(newTabPage());
		}
		label(t);
		activate(t);
		return t;
	}

	function closeTab(t: Tab) {
		const i = tabs.indexOf(t);
		if (i < 0) return;
		tabs.splice(i, 1);
		t.tabEl.remove();
		t.iframe.remove();
		if (!tabs.length) {
			openTab();
			return;
		}
		if (active === t) activate(tabs[Math.min(i, tabs.length - 1)]);
	}

	function go(input: string) {
		const url = toUrl(input);
		if (!url || !active) return;
		active.url = url;
		label(active);
		omni.value = url;
		active.frame.go(url);
		omni.blur();
	}

	omniForm.addEventListener("submit", (e) => {
		e.preventDefault();
		go(omni.value);
	});
	omni.addEventListener("focus", () => omni.select());
	plus.addEventListener("click", () => openTab());

	root.querySelector(".toolbar")!.addEventListener("click", (e) => {
		const a = (e.target as HTMLElement).closest("button")?.dataset.a;
		if (!a || !active) return;
		if (a === "back") active.frame.back();
		else if (a === "fwd") active.frame.forward();
		else if (a === "reload") active.frame.reload();
		else if (a === "home") {
			active.url = "";
			active.title = "New Tab";
			label(active);
			omni.value = "";
			active.iframe.src = "data:text/html;base64," + btoa(newTabPage());
		}
	});

	window.addEventListener("message", (e) => {
		if (e.data && typeof e.data.novaGo === "string") go(e.data.novaGo);
	});

	window.addEventListener("keydown", (e) => {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.key === "t") { e.preventDefault(); openTab(); }
		else if (mod && e.key === "w") { e.preventDefault(); if (active) closeTab(active); }
		else if (mod && e.key === "l") { e.preventDefault(); omni.focus(); }
		else if (mod && e.key === "r") { e.preventDefault(); active?.frame.reload(); }
	});

	const goto = new URL(location.href).searchParams.get("goto");
	if (goto) history.replaceState(null, "", location.pathname);
	openTab(goto || undefined);
}
