import { $ } from "./utils.js";
import { bus } from "./state.js";
import { initDialogs } from "./dialogs.js";
import { initSearch } from "./search.js";
import { initChat } from "./chat.js";
import { initProfile } from "./profile.js";
import { initChannels } from "./channels.js";
import { initGroups } from "./groups.js";
import { initAuth } from "./auth.js";
import { initSettings } from "./settings.js";
import { initInfo } from "./info.js";
import { initManage } from "./manage.js";
import { initNotices } from "./notices.js";
import { initRecs } from "./recs.js";
import { initWall } from "./wall.js";
import { initLinks } from "./links.js";

initDialogs();
initSearch();
initChat();
initProfile();
initChannels();
initGroups();
initInfo();
initManage();

$("#navMessages").onclick = () => { bus.emit("search:clear"); bus.emit("chat:close"); };

document.addEventListener("click", (e) => { if (!e.target.closest("#meBtn")) $("#app").classList.remove("menu-open"); });

initSettings();
initNotices();
initRecs();
initWall();
initLinks();
initAuth();
