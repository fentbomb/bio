document.addEventListener("DOMContentLoaded", function () {
  const titleElement = document.querySelector("title");
  const ipAddressElement = document.getElementById("ip-address");
  const countryElement = document.getElementById("country");
  const locationElement = document.getElementById("location");
  const ispElement = document.getElementById("isp");
  const timeElement = document.getElementById("time");
  const deviceInfoElement = document.getElementById("device-info");
  const titles = " overdose ";
  let index = 0;
  const delay = 200;
  let titleIntervalId = null;
  const updateTitle = () => {
    if (!titleElement) return;
    titleElement.textContent = titles.substring(index) + titles.substring(0, index);
    index = (index + 1) % titles.length;
  };

  const updateTime = () => {
    try {
      if (!timeElement) return;
      const now = new Date();
      const timeOptions = {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      };
      const dateOptions = {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const timeString = now.toLocaleTimeString("th-TH", timeOptions);
      const dateString = now.toLocaleDateString("th-TH", dateOptions).replace(/\//g, "/");
      timeElement.textContent = `Date & Time: ${dateString} ${timeString}`;
    } catch (error) { }
  };

  const safeText = (value, fallback = "Unknown") => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length ? text : fallback;
  };

  const safeNumber = (value, fallback = 0) => {
    const n = Number(value);
    return typeof n === "number" && isFinite(n) ? n : fallback;
  };

  const getPath = (obj, path, fallback) => {
    try {
      let cur = obj;
      for (let i = 0; i < path.length; i++) {
        if (cur === null || cur === undefined) return fallback;
        cur = cur[path[i]];
      }
      return cur === undefined ? fallback : cur;
    } catch {
      return fallback;
    }
  };

  const setText = (el, text) => {
    if (!el) return;
    el.textContent = text;
  };

  const normalizeCountryCode = (code) => {
    const c = safeText(code, "").toLowerCase();
    return /^[a-z]{2}$/.test(c) ? c : "";
  };

  const CACHE_KEY = "ipdata_cache_v1";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  const hasLocalStorage = () => {
    try {
      return typeof localStorage !== "undefined";
    } catch {
      return false;
    }
  };

  const readCache = () => {
    try {
      if (!hasLocalStorage()) return null;
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.ts !== "number" || !parsed.data) return null;
      if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  };

  const writeCache = (data) => {
    try {
      if (!hasLocalStorage()) return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch { }
  };

  const fetchJsonWithTimeout = async (url, { timeoutMs = 4500 } = {}) => {
    if (typeof fetch !== "function") throw new Error("fetch not supported");

    const doFetch = (signal) =>
      fetch(url, {
        method: "GET",
        cache: "no-store",
        signal,
      });

    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(controller.signal);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    }

    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      });
      const response = await Promise.race([doFetch(undefined), timeoutPromise]);
      if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : "?"}`);
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const fetchWithRetry = async (fn, attempts = 2) => {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 200 + i * 250));
      }
    }
    throw lastError;
  };

  const renderIpData = (data) => {
    const ip = safeText(getPath(data, ["ip"], null), "Unable to retrieve data.");
    setText(ipAddressElement, `IP Address: ${ip}`);

    const countryName = safeText(getPath(data, ["country_name"], null));
    const countryCode = normalizeCountryCode(getPath(data, ["country_code"], null));
    if (countryElement) {
      countryElement.textContent = `Country: ${countryName}`;
      if (countryCode) {
        const img = document.createElement("img");
        img.id = "flag";
        img.src = `https://flagcdn.com/24x18/${countryCode}.png`;
        img.alt = `${countryName} Flag`;
        countryElement.appendChild(document.createTextNode(" "));
        countryElement.appendChild(img);
      }
    }

    const city = safeText(getPath(data, ["city"], null));
    const region = safeText(getPath(data, ["region"], null));
    setText(locationElement, `Location: ${city}, ${region}`);

    const isp = safeText(getPath(data, ["asn", "name"], null));
    setText(ispElement, `Provider: ${isp}`);
  };

  const getIPAddress = async () => {
    try {
      const cached = readCache();
      if (cached) {
        renderIpData(cached);
        return;
      }

      const url = "https://api.ipdata.co/?api-key=8701de3ac942a16e52762033f240682911128f1d6a0a2e31cc70bbb9";
      const data = await fetchWithRetry(() => fetchJsonWithTimeout(url, { timeoutMs: 5000 }), 2);
      if (!data || typeof data !== "object") throw new Error("Invalid response");
      writeCache(data);
      renderIpData(data);
    } catch (error) {
      if (typeof fetch !== "function") {
        setText(ipAddressElement, "IP Address: Unsupported browser.");
      } else {
        setText(ipAddressElement, "IP Address: Unable to retrieve data.");
      }
      setText(countryElement, "Country: Unknown");
      setText(locationElement, "Location: Unknown");
      setText(ispElement, "Provider: Unknown");
    }
  };

  const getOSInfo = (ua) => {
    if (/windows nt 10\.0/.test(ua)) return "Windows 10/11";
    if (/windows nt 6\.3/.test(ua)) return "Windows 8.1";
    if (/windows nt 6\.2/.test(ua)) return "Windows 8";
    if (/windows nt 6\.1/.test(ua)) return "Windows 7";
    if (/android/.test(ua)) return "Android";
    if (/iphone|ipad|ipod/.test(ua)) return "iOS";
    if (/mac os x/.test(ua)) return "macOS";
    if (/cros/.test(ua)) return "Chrome OS";
    if (/linux/.test(ua)) return "Linux";
    return "Unknown OS";
  };

  const getLocaleInfo = () => {
    try {
      const lang = safeText(navigator.language, "Unknown");
      let tz = "Unknown";
      try {
        tz = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Unknown";
      } catch { }
      return `Locale: ${lang} | TZ: ${safeText(tz, "Unknown")}`;
    } catch {
      return "Locale: Unknown";
    }
  };

  const getDeviceInfo = () => {
    try {
      if (!deviceInfoElement) return;
      const userAgent = safeText(navigator.userAgent, "");
      const ua = userAgent.toLowerCase();
      let deviceType = "Unknown Device";
      let browserType = "Unknown Browser";

      if (/ipad/.test(ua) || (/(macintosh)/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1)) {
        deviceType = "iPad";
      } else if (/iphone/.test(ua)) {
        deviceType = "iPhone";
      } else if (/android/.test(ua)) {
        deviceType = /mobile/.test(ua) ? "Android Phone" : "Android Tablet";
      } else if (/windows/.test(ua)) {
        deviceType = "Windows PC";
      } else if (/macintosh|mac os x/.test(ua)) {
        deviceType = "Macintosh";
      } else if (/cros/.test(ua)) {
        deviceType = "Chrome OS";
      } else {
        deviceType = "Desktop";
      }

      if (/edg\//.test(ua)) {
        browserType = "Microsoft Edge";
      } else if (/opr\//.test(ua) || /opera/.test(ua)) {
        browserType = "Opera";
      } else if (/chrome\//.test(ua) && !/edg\//.test(ua) && !/opr\//.test(ua)) {
        browserType = "Google Chrome";
      } else if (/firefox\//.test(ua)) {
        browserType = "Mozilla Firefox";
      } else if (/safari\//.test(ua) && !/chrome\//.test(ua) && !/crios\//.test(ua) && !/fxios\//.test(ua)) {
        browserType = "Safari";
      } else if (/msie|trident/.test(ua)) {
        browserType = "Internet Explorer";
      }

      const osType = getOSInfo(ua);
      const platform = safeText(navigator.platform, "Unknown");
      const localeInfo = getLocaleInfo();
      deviceInfoElement.textContent =
        `Device: ${deviceType}\n` +
        `OS: ${osType}\n` +
        `Browser: ${browserType}\n` +
        `Platform: ${platform}\n` +
        `${localeInfo}`;
    } catch (error) {
      deviceInfoElement.textContent = "Device: Unknown | Browser: Unknown";
    }
  };

  getIPAddress();
  getDeviceInfo();
  updateTime();
  const startTitleLoop = () => {
    if (titleIntervalId !== null) return;
    titleIntervalId = setInterval(updateTitle, delay);
  };
  const stopTitleLoop = () => {
    if (titleIntervalId === null) return;
    clearInterval(titleIntervalId);
    titleIntervalId = null;
  };
  startTitleLoop();
  setInterval(updateTime, 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTitleLoop();
    } else {
      updateTitle();
      startTitleLoop();
    }
  });
});