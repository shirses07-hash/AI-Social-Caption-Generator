import { useRef, useState } from "react";
import axios from "axios";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  X,
  WandSparkles,
} from "lucide-react";
import "./App.css";

const API_URL = `${import.meta.env.VITE_API_URL}/api/captions/generate`;

function App() {
  const fileInputRef = useRef(null);
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Casual");
  const [imageData, setImageData] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [imageName, setImageName] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [error, setError] = useState("");

  const handleImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Please choose an image smaller than 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageData(String(reader.result).split(",")[1] || "");
      setMimeType(file.type);
      setImageName(file.name);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageData("");
    setMimeType("");
    setImageName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const requestCaption = async (previousCaption = "") => {
    if (!topic.trim() && !imageData) {
      setError("Upload an image or add a description to get started.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(API_URL, {
        topic,
        platform,
        tone,
        imageData,
        mimeType,
        previousCaption,
      });

      const newResult = response.data;
      setResult(newResult);

      if (previousCaption) {
        setHistory((prev) => [
          ...prev,
          {
            ...result,
            id: result?._id || `local-${Date.now()}`,
          },
        ].filter(Boolean));
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const copyCaption = async (item, id) => {
    if (!item?.caption) return;
    try {
      await navigator.clipboard.writeText(
        `${item.caption}\n\n${(item.hashtags || []).join(" ")}`
      );
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const clearAll = () => {
    setTopic("");
    setResult(null);
    setHistory([]);
    removeImage();
    setError("");
  };

  return (
    <div className="app-shell">
      <div className="orb orb-one" />
      <div className="orb orb-two" />

      <main className="app">
        <header className="hero">
          <div className="hero-badge"><Sparkles size={15} /> Caption Lab</div>
          <h1>Post the pic.<br /><span>We’ll find the words.</span></h1>
          <p>Upload your photo, add the vibe, and let AI turn it into a caption worth posting.</p>
        </header>

        <section className="workspace-card">
          <div className="section-kicker"><WandSparkles size={16} /> CREATE YOUR VIBE</div>

          <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleImage(e.target.files?.[0])}
            />

            {imageData ? (
              <div className="image-preview-wrap" onClick={(e) => e.stopPropagation()}>
                <img src={`data:${mimeType};base64,${imageData}`} alt="Selected" className="image-preview" />
                <button className="remove-image" onClick={removeImage} aria-label="Remove image"><X size={16} /></button>
                <div className="image-file-pill"><ImageIcon size={14} /> {imageName}</div>
              </div>
            ) : (
              <>
                <div className="upload-icon"><Upload size={25} /></div>
                <strong>Drop your photo here</strong>
                <span>or click to browse · JPG, PNG, WEBP · up to 8MB</span>
              </>
            )}
          </div>

          <div className="description-head">
            <label htmlFor="topic">What’s the context? <span>optional with a photo</span></label>
            <small>{topic.length}/300</small>
          </div>
          <textarea
            id="topic"
            maxLength={300}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. New chocolate brownie ice cream launching this weekend 🍫🍦"
            rows={4}
          />

          <div className="controls">
            <div className="control">
              <label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option>Instagram</option>
                <option>LinkedIn</option>
                <option>X</option>
              </select>
            </div>
            <div className="control">
              <label>Tone</label>
              <select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option>Casual</option>
                <option>Professional</option>
                <option>Funny</option>
                <option>Inspirational</option>
                <option>Persuasive</option>
                <option>Friendly</option>
              </select>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button className="generate-button" onClick={() => requestCaption()} disabled={loading}>
            {loading ? <><span className="spinner" /> Creating your vibe...</> : <><Sparkles size={19} /> Generate Caption</>}
          </button>
        </section>

        {result && (
          <section className="results-area">
            <div className="result-title-row">
              <div>
                <div className="section-kicker"><Sparkles size={15} /> YOUR VIBE CHECK</div>
                <h2>Here’s what we came up with ✨</h2>
              </div>
              <button className="clear-button" onClick={clearAll}>Start over</button>
            </div>

            <article className="caption-card featured">
              <div className="caption-card-top"><span className="variation-label">NEW CAPTION</span><span>just generated</span></div>
              <p className="caption-text">{result.caption}</p>
              <div className="hashtags">
                {(result.hashtags || []).map((tag, i) => <span key={i}>{tag}</span>)}
              </div>
              <div className="action-row">
                <button className="secondary-button" onClick={() => copyCaption(result, result._id || "current")}>
                  {copiedId === (result._id || "current") ? <><Check size={17} /> Copied!</> : <><Copy size={17} /> Copy</>}
                </button>
                <button className="regenerate-button" onClick={() => requestCaption(result.caption)} disabled={loading}>
                  <RefreshCw size={17} className={loading ? "spin" : ""} /> {loading ? "Creating..." : "Regenerate"}
                </button>
              </div>
            </article>

            {history.length > 0 && (
              <div className="history-section">
                <div className="history-heading"><div><span>PREVIOUS VIBES</span><h3>Keep the good ones.</h3></div><em>{history.length} variation{history.length > 1 ? "s" : ""}</em></div>
                <div className="history-grid">
                  {history.slice().reverse().map((item, index) => {
                    const id = item.id || item._id || index;
                    return (
                      <article className="caption-card history-card" key={id}>
                        <div className="caption-card-top"><span>VERSION {history.length - index}</span></div>
                        <p className="caption-text">{item.caption}</p>
                        <div className="hashtags mini">{(item.hashtags || []).map((tag, i) => <span key={i}>{tag}</span>)}</div>
                        <button className="history-copy" onClick={() => copyCaption(item, id)}>
                          {copiedId === id ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy caption</>}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        <footer>Made for creators who have the photo but not the caption. <span>✦</span></footer>
      </main>
    </div>
  );
}

export default App;
