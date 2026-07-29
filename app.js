const CLERK_PUBLISHABLE_KEY = "pk_test_Zmlyc3QtbW9ua2Zpc2gtNTkuY2xlcmsuYWNjb3VudHMuZGV2JA";
const FRONTEND_API = "first-monkfish-59.clerk.accounts.dev";

let userId = null;
let globalStyle = "";
let currentSubMode = "auto";

// Usage Limits
const MAX_DRAFTS = 3;
const MAX_HAIKU = 1;
const MAX_DEEPSEEK_POLISH = 3;

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://istizzojkchvwbxnoivy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdGl6em9qa2NodndieG5vaXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjY5OTYsImV4cCI6MjEwMDE0Mjk5Nn0.driL6QhosL1yD8gTyPaHM-9j7cbPzuzAujSk__7qyGc";
// Initialized once the CDN script has loaded (supabase is exposed globally via UMD bundle)
let supabase = null;

function initSupabase() {
  if (window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("[Supabase] CDN script not loaded — cross-device sync disabled.");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

function getStorageKey(type) {
  return `ivresse_${userId}_${type}`;
}

// Usage Management
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getUsage() {
  const usageStr = localStorage.getItem(getStorageKey('usage'));
  const today = getTodayString();
  if (usageStr) {
    const usage = JSON.parse(usageStr);
    if (usage.date === today) {
      if (usage.deepseekPolishes === undefined) usage.deepseekPolishes = 0;
      return usage;
    }
  }
  return { date: today, drafts: 0, haikus: 0, deepseekPolishes: 0 };
}

function saveUsage(usage) {
  localStorage.setItem(getStorageKey('usage'), JSON.stringify(usage));
  updateUsageUI();
  // Fire-and-forget remote sync — errors are caught internally
  syncUsageToSupabase(usage);
}

// ── Supabase Sync Functions ───────────────────────────────────────────────────

/**
 * On login: fetch the user's usage row from Supabase.
 * If found, overwrite localStorage with the remote values so usage is
 * consistent across devices. If the row's last_reset date is not today,
 * the counts are reset to 0 and the remote row is updated immediately.
 */
async function loadUsageFromSupabase() {
  if (!supabase) return; // CDN not loaded — fall back to localStorage only
  if (!userId) return;   // Clerk not ready yet

  try {
    const { data, error } = await supabase
      .from('ivresse_usage')
      .select('drafts, deepseek_polishes, haikus, last_reset')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] loadUsageFromSupabase SELECT failed:', error);
      return;
    }

    const today = getTodayString();

    if (!data) {
      // No row yet — the first saveUsage() call will create it via UPSERT
      console.log('[Supabase] No usage row found for user — will create on first use.');
      return;
    }

    let { drafts, deepseek_polishes, haikus, last_reset } = data;

    // If last_reset is a past date, reset counts and persist immediately
    if (last_reset !== today) {
      drafts = 0;
      deepseek_polishes = 0;
      haikus = 0;
      await syncUsageToSupabase({ date: today, drafts, deepseekPolishes: deepseek_polishes, haikus });
    }

    // Overwrite localStorage with the authoritative remote values
    const usage = {
      date: today,
      drafts,
      deepseekPolishes: deepseek_polishes,
      haikus
    };
    localStorage.setItem(getStorageKey('usage'), JSON.stringify(usage));
    updateUsageUI();
    console.log('[Supabase] Usage loaded from remote:', usage);

  } catch (err) {
    console.error('[Supabase] loadUsageFromSupabase unexpected error:', err);
  }
}

/**
 * UPSERT the current usage counts to the user_usage table.
 * Called every time credits/tokens are deducted.
 */
async function syncUsageToSupabase(usage) {
  if (!supabase) return;
  if (!userId) return;

  try {
    const { error } = await supabase
      .from('ivresse_usage')
      .upsert({
        user_id: userId,
        drafts: usage.drafts,
        deepseek_polishes: usage.deepseekPolishes,
        haikus: usage.haikus,
        last_reset: usage.date,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[Supabase] syncUsageToSupabase UPSERT failed:', error);
    }
  } catch (err) {
    console.error('[Supabase] syncUsageToSupabase unexpected error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function updateUsageUI() {
  const usage = getUsage();
  
  // Drafts
  document.getElementById("usage-draft-text").innerText = `${usage.drafts} / ${MAX_DRAFTS}`;
  const draftPercent = Math.min((usage.drafts / MAX_DRAFTS) * 100, 100);
  document.getElementById("usage-draft-fill").style.width = `${draftPercent}%`;
  
  // Deepseek Polishes
  document.getElementById("usage-deepseek-text").innerText = `${usage.deepseekPolishes} / ${MAX_DEEPSEEK_POLISH}`;
  const deepseekPercent = Math.min((usage.deepseekPolishes / MAX_DEEPSEEK_POLISH) * 100, 100);
  document.getElementById("usage-deepseek-fill").style.width = `${deepseekPercent}%`;
  
  // Haiku
  document.getElementById("usage-haiku-text").innerText = `${usage.haikus} / ${MAX_HAIKU}`;
  const haikuPercent = Math.min((usage.haikus / MAX_HAIKU) * 100, 100);
  document.getElementById("usage-haiku-fill").style.width = `${haikuPercent}%`;
}


async function callAPI(modelType, systemPrompt, userPrompt) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      model_type: modelType, 
      system_prompt: systemPrompt, 
      user_prompt: userPrompt 
    })
  });
  if (!res.ok) throw new Error("API Request Failed");
  const data = await res.json();
  return data.content[0].text;
}

function showView(viewId) {
  document.getElementById("view-1-draft").style.display = "none";
  document.getElementById("view-2-deepseek").style.display = "none";
  document.getElementById("view-3-claude").style.display = "none";
  document.getElementById("usage-area").style.display = "none";
  
  document.getElementById(viewId).style.display = "block";
}

function initializeApp() {
  // Theme Toggle Logic
  const savedTheme = localStorage.getItem('ivresse_theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('theme-toggle-btn').innerHTML = '<i class="ph ph-moon"></i>';
  }

  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'light') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('ivresse_theme', 'dark');
      document.getElementById('theme-toggle-btn').innerHTML = '<i class="ph ph-sun"></i>';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('ivresse_theme', 'light');
      document.getElementById('theme-toggle-btn').innerHTML = '<i class="ph ph-moon"></i>';
    }
  });

  // Load Global Style
  const savedStyle = localStorage.getItem(getStorageKey('globalStyle'));
  if (savedStyle) {
    globalStyle = savedStyle;
    document.getElementById("style-input").value = globalStyle;
  }

  // Load Saved Name
  const savedName = localStorage.getItem(getStorageKey('yourName'));
  if (savedName) {
    document.getElementById("your-name-input").value = savedName;
  }

  // Save Name on change
  document.getElementById("your-name-input").addEventListener("input", (e) => {
    localStorage.setItem(getStorageKey('yourName'), e.target.value);
  });
  
  updateUsageUI();

  // Go Back Buttons
  document.querySelectorAll(".go-back-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (document.getElementById("view-3-claude").style.display === "block") {
        showView("view-2-deepseek");
      } else {
        showView("view-1-draft");
      }
    });
  });

  // Next to Claude Button
  document.getElementById("next-to-claude-btn").addEventListener("click", () => {
    const text = document.getElementById("output-deepseek").value;
    document.getElementById("output-claude").value = text;
    showView("view-3-claude");
  });

  // Main Tabs logic
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const mode = e.target.getAttribute("data-mode");
      
      if (mode === "draft") {
        showView("view-1-draft");
      } else if (mode === "style") {
        showView("style-area"); // We hijack showView for this logic
        document.getElementById("view-1-draft").style.display = "block"; // Keep view 1 structure visible
        document.getElementById("draft-area").style.display = "none";
      } else if (mode === "usage") {
        showView("usage-area");
        document.getElementById("view-1-draft").style.display = "block"; // Keep view 1 structure visible
        document.getElementById("draft-area").style.display = "none";
        document.getElementById("style-area").style.display = "none";
      }
    });
  });
  
  // Re-bind Draft Tab explicitly to reset sub-areas
  document.querySelector('.tab[data-mode="draft"]').addEventListener("click", () => {
    document.getElementById("draft-area").style.display = "block";
    document.getElementById("style-area").style.display = "none";
    document.getElementById("usage-area").style.display = "none";
  });

  // Sub-tabs logic (Manual vs Auto)
  document.querySelectorAll(".sub-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll(".sub-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      currentSubMode = e.target.getAttribute("data-sub");
      
      if (currentSubMode === "manual") {
        document.getElementById("manual-fields").style.display = "block";
        document.getElementById("auto-fields").style.display = "none";
      } else {
        document.getElementById("manual-fields").style.display = "none";
        document.getElementById("auto-fields").style.display = "block";
      }
    });
  });

  // Save Style
  document.getElementById("save-style-btn").addEventListener("click", () => {
    globalStyle = document.getElementById("style-input").value;
    localStorage.setItem(getStorageKey('globalStyle'), globalStyle);
    
    const btnText = document.getElementById("save-style-btn-text");
    btnText.innerText = "Saved!";
    setTimeout(() => { btnText.innerText = "Save Global Style"; }, 2000);
  });

  // 1. Generate Email (Initial Draft)
  document.getElementById("generate-btn").addEventListener("click", async () => {
    const usage = getUsage();
    if (usage.drafts >= MAX_DRAFTS) {
      alert("You have reached your daily limit for Drafts (3/3). Please upgrade in the Usage tab.");
      return;
    }

    const yourName = document.getElementById("your-name-input").value || "[Your Name]";
    const recipientName = document.getElementById("recipient-name-input").value || "[Recipient Name]";
    
    document.getElementById("generate-btn").disabled = true;
    const originalText = document.getElementById("generate-btn-text").innerText;
    document.getElementById("generate-btn-text").innerText = "Thinking...";
    
    try {
      let systemPrompt = `You are a professional email drafting assistant. Output ONLY the raw email content, beginning with a "Subject: " line. No diffs, no commentary, no introductory text.\n\n`;
      
      if (globalStyle) {
        systemPrompt += `**Your Global Writing Style Guidelines (Strictly adhere to these):**\n${globalStyle}\n\n`;
      }
      
      systemPrompt += `**Sender Name**: ${yourName}\n`;
      systemPrompt += `**Recipient Name**: ${recipientName}\n\n`;

      let finalPrompt = "";

      if (currentSubMode === "manual") {
        const situation = document.getElementById("situation-select").value;
        const recipientType = document.getElementById("recipient-select").value;
        const tone = document.getElementById("tone-select-manual").value;
        const briefDesc = document.getElementById("brief-desc-input").value;
        const point = document.getElementById("point-input-manual").value;
        
        if (!briefDesc) throw new Error("Please provide a brief description.");
        
        systemPrompt += `**Tone**: ${tone}\n`;
        systemPrompt += `**Recipient Context (Calibrate formality for them)**: The recipient is a ${recipientType}.\n`;
        systemPrompt += `**Situation**: ${situation}\n\n`;
        
        finalPrompt += `Draft the email based on these notes:\nDescription: ${briefDesc}\n`;
        if (point) finalPrompt += `Core Point/Action Item: ${point}\n`;

      } else {
        const tone = document.getElementById("tone-select-auto").value;
        const prevEmail = document.getElementById("previous-email-input").value;
        const point = document.getElementById("point-input-auto").value;
        const extraNote = document.getElementById("extra-note-input").value;
        
        if (!prevEmail) throw new Error("Please paste the previous email thread.");
        
        systemPrompt += `**Tone**: ${tone}\n`;
        systemPrompt += `**Task**: Generate a contextual reply to the provided email thread based on the user's extra notes.\n\n`;
        
        finalPrompt += `I am replying to the following email:\n"${prevEmail}"\n\n`;
        if (point) finalPrompt += `Core Point/Action Item of reply:\n${point}\n\n`;
        if (extraNote) finalPrompt += `Extra Details (Excuses, Context, etc):\n${extraNote}\n\n`;
        finalPrompt += `Draft the final reply email.`;
      }
      
      const result = await callAPI("deepseek", systemPrompt, finalPrompt);
      
      usage.drafts += 1;
      saveUsage(usage);

      // Transition to View 2
      document.getElementById("output-deepseek").value = result;
      showView("view-2-deepseek");
      
    } catch (e) {
      alert(e.message || "Generation failed. Is the proxy server running?");
    } finally {
      document.getElementById("generate-btn").disabled = false;
      document.getElementById("generate-btn-text").innerText = originalText;
    }
  });

  // 2. Polish with Deepseek Pro
  document.getElementById("polish-deepseek-btn").addEventListener("click", async () => {
    const usage = getUsage();
    if (usage.deepseekPolishes >= MAX_DEEPSEEK_POLISH) {
      alert("You have reached your daily limit for Deepseek Pro Polishes (3/3). Please upgrade in the Usage tab.");
      return;
    }

    const currentText = document.getElementById("output-deepseek").value;
    const userNotes = document.getElementById("deepseek-note-input").value;
    
    if (!currentText) return;

    document.getElementById("polish-deepseek-btn").disabled = true;
    const originalText = document.getElementById("polish-deepseek-btn-text").innerText;
    document.getElementById("polish-deepseek-btn-text").innerText = "Polishing...";
    
    try {
      const systemPrompt = `You are an elite copy editor. Your job is to take the provided email draft and deeply polish it based on the user's explicit notes. If no notes are provided, just improve the flow and grammar. Do NOT alter names. Ensure the draft still starts with a "Subject: " line. Output ONLY the raw polished email content. No conversational intro.`;
      let finalPrompt = `Original Draft:\n"${currentText}"\n\n`;
      if (userNotes) finalPrompt += `User Instructions for Polishing:\n${userNotes}\n\n`;
      finalPrompt += `Provide the polished draft.`;

      const result = await callAPI("deepseek", systemPrompt, finalPrompt);
      document.getElementById("output-deepseek").value = result;
      
      usage.deepseekPolishes += 1;
      saveUsage(usage);
    } catch (e) {
      alert("Deepseek Polish failed.");
    } finally {
      document.getElementById("polish-deepseek-btn").disabled = false;
      document.getElementById("polish-deepseek-btn-text").innerText = originalText;
    }
  });

  // 3. Final Polish with Claude Haiku
  document.getElementById("polish-claude-btn").addEventListener("click", async () => {
    const usage = getUsage();
    if (usage.haikus >= MAX_HAIKU) {
      alert("You have reached your daily limit for Claude Haiku (1/1). Please upgrade in the Usage tab.");
      return;
    }

    const currentText = document.getElementById("output-claude").value;
    const userNotes = document.getElementById("claude-note-input").value;
    
    if (!currentText) return;

    document.getElementById("polish-claude-btn").disabled = true;
    const originalText = document.getElementById("polish-claude-btn-text").innerText;
    document.getElementById("polish-claude-btn-text").innerText = "Polishing...";
    
    try {
      const systemPrompt = `You are a master email copy-editor. Your only job is to perform a final, light polish on the provided draft. Ensure it sounds extremely natural, flows perfectly, and has flawless grammar. Ensure the draft still starts with a "Subject: " line. Output ONLY the raw polished email content. No conversational intro.`;
      
      let finalPrompt = `Original Draft:\n"${currentText}"\n\n`;
      if (userNotes) finalPrompt += `User Instructions for Polishing:\n${userNotes}\n\n`;
      finalPrompt += `Provide the polished draft.`;
      
      const result = await callAPI("anthropic", systemPrompt, finalPrompt);
      document.getElementById("output-claude").value = result;
      
      usage.haikus += 1;
      saveUsage(usage);
    } catch (e) {
      alert("Claude Polish failed.");
    } finally {
      document.getElementById("polish-claude-btn").disabled = false;
      document.getElementById("polish-claude-btn-text").innerText = originalText;
    }
  });

  // Stripe Subscription Checkouts
  document.querySelectorAll(".sub-checkout-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const priceId = e.currentTarget.getAttribute("data-price");
      
      const originalText = e.currentTarget.innerText;
      e.currentTarget.innerText = "Loading...";
      e.currentTarget.disabled = true;

      try {
        const res = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId: priceId })
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create session");
        }
        
        const data = await res.json();
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } catch (error) {
        alert("Checkout Error: " + error.message);
        e.currentTarget.innerText = originalText;
        e.currentTarget.disabled = false;
      }
    });
  });

  // Copy Buttons
  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetId = e.currentTarget.getAttribute("data-target");
      const output = document.getElementById(targetId);
      output.select();
      document.execCommand("copy");
      const originalHTML = e.currentTarget.innerHTML;
      e.currentTarget.innerHTML = '<i class="ph ph-check"></i> Copied!';
      setTimeout(() => { e.currentTarget.innerHTML = originalHTML; }, 2000);
    });
  });

  // Gmail Buttons
  document.querySelectorAll(".gmail-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetId = e.currentTarget.getAttribute("data-target");
      const fullText = document.getElementById(targetId).value;
      
      let subject = "Generated by Ivresse AI";
      let bodyText = fullText;
      
      const subjectMatch = fullText.match(/^Subject:\s*(.*?)(?:\n|$)/i);
      if (subjectMatch) {
        subject = subjectMatch[1];
        bodyText = fullText.replace(subjectMatch[0], "").replace(/^\n+/, "");
      }

      window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`, '_blank');
    });
  });

  // Outlook Buttons
  document.querySelectorAll(".outlook-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetId = e.currentTarget.getAttribute("data-target");
      const fullText = document.getElementById(targetId).value;
      
      let subject = "Generated by Ivresse AI";
      let bodyText = fullText;
      
      const subjectMatch = fullText.match(/^Subject:\s*(.*?)(?:\n|$)/i);
      if (subjectMatch) {
        subject = subjectMatch[1];
        bodyText = fullText.replace(subjectMatch[0], "").replace(/^\n+/, "");
      }

      window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`, '_blank');
    });
  });
}

function initializeClerk() {
  const script = document.createElement("script");
  script.setAttribute("data-clerk-publishable-key", CLERK_PUBLISHABLE_KEY);
  script.async = true;
  script.src = `https://${FRONTEND_API}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
  script.crossOrigin = "anonymous";
  
  script.addEventListener("load", async function () {
    try {
      await window.Clerk.load();
      
      const clerk = window.Clerk;
      document.getElementById("loading-overlay").style.display = "none";
      
      const userButtonDiv = document.getElementById("user-button-container");
      
      if (!clerk.user) {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('signin')) {
          clerk.redirectToSignIn({ returnBackUrl: window.location.href.split('?')[0] });
        } else if (urlParams.has('signup')) {
          clerk.redirectToSignUp({ returnBackUrl: window.location.href.split('?')[0] });
        } else {
          window.location.href = "/landing.html";
        }
      } else {
        userId = clerk.user.id;
        document.getElementById("app-container").style.display = "flex";

        // Initialize Supabase now that we have a userId
        initSupabase();
        // Fetch remote usage and overwrite localStorage (cross-device sync)
        loadUsageFromSupabase();
        
        const clerkAppearance = {
          elements: {
            activeDeviceSection: "hidden",
            dangerSection: "hidden",
            navbarButton__danger: "hidden",
            navbarButton__activeDevices: "hidden",
            profileSection__activeDevices: "hidden",
            profileSection__danger: "hidden"
          }
        };

        clerk.mountUserButton(userButtonDiv, { appearance: clerkAppearance });
        
        initializeApp();
      }
    } catch (error) {
      console.error("Error loading Clerk:", error);
      document.getElementById("loading-overlay").innerHTML = "<p>Failed to initialize Clerk.</p>";
    }
  });

  script.addEventListener("error", function() {
    document.getElementById("loading-overlay").innerHTML = "<p>Failed to load Clerk script.</p>";
  });

  document.body.appendChild(script);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeClerk();
});
