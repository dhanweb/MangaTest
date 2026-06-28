const views = document.querySelectorAll(".view");
const viewButtons = document.querySelectorAll("[data-target]");
const navItems = document.querySelectorAll(".nav-item[data-target]");

function showView(targetId) {
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === targetId);
  });

  navItems.forEach((item) => {
    item.classList.toggle("is-active", item.dataset.target === targetId);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.target;
    if (targetId) {
      showView(targetId);
    }
  });
});

document.querySelectorAll(".tag-group button").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-selected");
  });
});

const collapseButton = document.querySelector(".collapse-tags");
const tagPanel = document.querySelector(".tag-panel");

collapseButton?.addEventListener("click", () => {
  const collapsed = tagPanel.classList.toggle("is-collapsed");
  collapseButton.textContent = collapsed ? "展开 ↓" : "收起 ↑";
  collapseButton.setAttribute("aria-expanded", String(!collapsed));
});

document.querySelectorAll(".favorite-action").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-saved");
    const label = button.querySelector("span");
    if (label) {
      label.textContent = button.classList.contains("is-saved") ? "已收藏 (2)" : "收藏";
    }
  });
});

const adminTabButtons = document.querySelectorAll("[data-admin-tab]");
const adminPanels = document.querySelectorAll(".admin-panel");

function showAdminPanel(tabId) {
  adminPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `admin-${tabId}`);
  });

  adminTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === tabId);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

adminTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabId = button.dataset.adminTab;
    if (tabId) {
      showAdminPanel(tabId);
    }
  });
});

document.querySelectorAll(".admin-tabs").forEach((tabGroup) => {
  tabGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.dataset.adminTab) {
      return;
    }

    tabGroup.querySelectorAll(".is-active").forEach((active) => {
      active.classList.remove("is-active");
    });
    button.classList.add("is-active");
  });
});

const consoleTabButtons = document.querySelectorAll("[data-console-tab]");
const consolePanels = document.querySelectorAll(".console-panel");

function showConsolePanel(tabId) {
  consolePanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `console-${tabId}`);
  });

  consoleTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.consoleTab === tabId);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

consoleTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabId = button.dataset.consoleTab;
    if (tabId) {
      showConsolePanel(tabId);
    }
  });
});

const settingsTabButtons = document.querySelectorAll("[data-settings-tab]");
const settingsPanels = document.querySelectorAll(".settings-tab-panel");

function showSettingsPanel(tabId) {
  settingsPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `setting-${tabId}`);
  });

  settingsTabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.settingsTab === tabId);
  });
}

settingsTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const tabId = button.dataset.settingsTab;
    if (tabId) {
      showSettingsPanel(tabId);
    }
  });
});

document.querySelectorAll(".tag-chip-manage").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-ghosted");
  });
});
