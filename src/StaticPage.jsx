import { Utensils, MapPin, Sparkles } from "lucide-react";

export default function StaticPage({ page, session, onNavigate, onLogin, onLogout }) {
  const offers = page === "offers";
  return (
    <main className="static-page">
      <header className="static-nav">
        <a className="brand" href="#discover" onClick={() => onNavigate("discover")} aria-label="FoodScout home">
          <div className="brand-mark"><Utensils size={19} /></div>
          <span>food<span>scout</span></span>
        </a>
        <nav aria-label="Primary navigation">
          <button type="button" className={page === "discover" ? "active" : ""} onClick={() => onNavigate("discover")}>Discover</button>
          {session && <button type="button" className={page === "recommendations" ? "active" : ""} onClick={() => onNavigate("recommendations")}>Recommendations</button>}
          <button type="button" className={offers ? "active" : ""} onClick={() => onNavigate("offers")}>Offers</button>
          <button type="button" className={page === "about" ? "active" : ""} onClick={() => onNavigate("about")}>About</button>
        </nav>
        {session
          ? <button type="button" className="static-avatar" onClick={onLogout} aria-label="Log out">FS</button>
          : <button type="button" className="landing-login" onClick={onLogin}>Log in</button>}
      </header>
      <section className="static-hero">
        <p className="eyebrow">{offers ? "LOCAL OFFERS" : "ABOUT FOODSCOUT"}</p>
        <h1>{offers ? <>Nearby <em>offers.</em></> : <>Find food worth <em>remembering.</em></>}</h1>
        {offers ? (
          <>
            <p>No offers are currently available from the connected restaurant data. We do not fabricate promotions or prices.</p>
            <div className="static-feature"><Sparkles size={20}/><span><strong>Offers stay honest</strong><small>Only verified restaurant promotions will appear here.</small></span></div>
          </>
        ) : (
          <>
            <p>FoodScout helps you discover nearby restaurants using live location-based provider data, local filtering and transparent recommendations.</p>
            <div className="static-feature-grid">
              <div className="static-feature"><MapPin size={20}/><span><strong>Nearby discovery</strong><small>Restaurant results and map markers stay synchronized.</small></span></div>
              <div className="static-feature"><Sparkles size={20}/><span><strong>Clear personalization</strong><small>Preferences are saved only through your account.</small></span></div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
