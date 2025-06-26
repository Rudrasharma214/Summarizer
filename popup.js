document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';

  const summaryType = document.getElementById("summary-type").value;
  const summaryLang = document.getElementById("summary-lang").value;

  chrome.storage.sync.get(["geminiApiKey"], async (result) => {
    if (!result.geminiApiKey) {
      resultDiv.innerHTML =
        "API key not found. Please set your API key in the extension options.";
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" }, async (res) => {
        if (!res || !res.text) {
          resultDiv.innerText = "Could not extract article text from this page.";
          return;
        }

        try {
          const summary = await getGeminiSummary(
            res.text,
            summaryType,
            result.geminiApiKey,
            summaryLang // ✅ Language passed properly
          );

          if (summaryType === "bullets") {
            const lines = summary.split(/\n+/).map(line => line.trim()).filter(Boolean);

            const formatted = lines
              .map((line) => {
                // Remove leading bullets if present
                const cleanLine = line.replace(/^[-•–—●▪️*]?\s*/, "").trim();
                return `<li>${cleanLine}</li>`;
              })
              .join("");

            resultDiv.innerHTML = `<h3>Bullet Point Summary</h3><ul>${formatted}</ul>`;
          }
          else if (summaryType === "detailed") {
            const formatted = summary
              .split(/\n\s*\n/)
              .map((para) => `<p>${para.trim()}</p>`)
              .join("");

            resultDiv.innerHTML = `<h3>Detailed Summary</h3>${formatted}`;
          } else {
            resultDiv.innerHTML = `<h3>Brief Summary</h3><p>${summary.trim()}</p>`;
          }
        } catch (error) {
          resultDiv.innerText = `Error: ${error.message || "Failed to generate summary."}`;
        }
      });
    });
  });
});

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;

  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard
      .writeText(summaryText)
      .then(() => {
        const copyBtn = document.getElementById("copy-btn");
        const originalText = copyBtn.innerText;

        copyBtn.innerText = "Copied!";
        setTimeout(() => {
          copyBtn.innerText = originalText;
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  }
});

async function getGeminiSummary(text, summaryType, apiKey, lang = "en") {
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let langInstruction = "";
  if (lang === "hi") {
    langInstruction =
      "IMPORTANT: Reply only in Hinglish (Hindi using English alphabets). Do not use Hindi script (like देवनागरी).\n\n";
  } else if (lang === "hi-dev") {
    langInstruction =
      "IMPORTANT: Reply in pure Hindi using Devanagari script. Don't mix English words.\n\n";
  }

  let prompt;

  switch (summaryType) {
    case "brief":
      prompt =
        langInstruction +
        (lang === "hi"
          ? `Is article ka short summary do 2-3 sentences me:\n\n${truncatedText}`
          : lang === "hi-dev"
            ? `इस लेख का संक्षिप्त सारांश 2-3 वाक्यों में दीजिए:\n\n${truncatedText}`
            : `Provide a brief summary of the following article in 2-3 sentences:\n\n${truncatedText}`);
      break;

    case "detailed":
      prompt =
        langInstruction +
        (lang === "hi"
          ? `Niche diye gaye article ka detailed summary banao. Sabhi important points include karo:\n\n${truncatedText}`
          : lang === "hi-dev"
            ? `इस लेख का विस्तृत सारांश बनाएं, जिसमें सभी मुख्य बिंदुओं को शामिल किया गया हो:\n\n${truncatedText}`
            : `Provide a detailed summary of the following article, covering all main points and key details:\n\n${truncatedText}`);
      break;

    case "bullets":
      prompt =
        langInstruction +
        (lang === "hi"
          ? `Article ka summary 5-7 bullet points me likho. Har point "- " se start hona chahiye. Simple aur short points ho.\n\n${truncatedText}`
          : lang === "hi-dev"
            ? `इस लेख का सारांश 5-7 बिंदुओं में दीजिए। हर बिंदु "-•–—●▪️* " से शुरू होना चाहिए।उदाहरण:-\n- पहला बिंदु\n- दूसरा बिंदु\n- तीसरा बिंदु\n\nलेख: \n\n${truncatedText}`
            : `Summarize the following article in 5-7 key points. Format each point as a line starting with "- ":\n\n${truncatedText}`);
      break;

    default:
      prompt =
        langInstruction +
        (lang === "hi"
          ? `Is article ka summary do Hinglish me:\n\n${truncatedText}`
          : lang === "hi-dev"
            ? `इस लेख का सारांश हिंदी में दीजिए:\n\n${truncatedText}`
            : `Summarize the following article:\n\n${truncatedText}`);
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "API request failed");
    }

    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No summary available."
    );
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate summary. Please try again later.");
  }
}

