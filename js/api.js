window.API = (() => {
  async function request(action, payload = {}) {
    if (!APP_CONFIG.API_URL) {
      throw new Error("API_URL ainda não configurada. Configure js/config.js após publicar o Apps Script.");
    }

    const response = await fetch(APP_CONFIG.API_URL, {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({action, payload})
    });

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Erro na API");
    return data;
  }

  return {request};
})();
