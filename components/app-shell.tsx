"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, useContext, useState } from "react"
import { Leaf, LayoutDashboard, ChartNoAxesCombined, ShieldCheck, SlidersHorizontal, ArrowUpRight, BookOpen } from "lucide-react"

const DetailContext = createContext(false)
export const useTechnicalDetail = () => useContext(DetailContext)
const navigation = [
  { href: "/", label: "Overview", description: "Understand & plan", icon: LayoutDashboard },
  { href: "/analytics", label: "Energy patterns", description: "Learn from the past", icon: ChartNoAxesCombined },
  { href: "/experiments", label: "Forecast checks", description: "See how predictions perform", icon: ShieldCheck },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [technical, setTechnical] = useState(false)
  return <DetailContext.Provider value={technical}>
    <a href="#page-content" className="skip-link">Skip to content</a>
    <aside className="app-sidebar">
      <Link href="/" className="brand"><span className="brand-icon"><Leaf size={23} /></span><span>Gridlight<small>Britain’s electricity, explained</small></span></Link>
      <p className="sidebar-label">YOUR ENERGY GUIDE</p>
      <nav aria-label="Main navigation" className="main-navigation">
        {navigation.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`nav-item ${pathname === href ? "is-active" : ""}`}><Icon size={19} /><span>{label}<small>{description}</small></span></Link>)}
      </nav>
      <div className="sidebar-note"><BookOpen size={20} /><p>A little context goes a long way.</p><span>Lower carbon means less CO₂ associated with each unit of electricity. It doesn’t mean zero emissions.</span></div>
    </aside>
    <div className="app-workspace">
      <div className="workspace-bar"><span>Great Britain <span className="text-muted-foreground">/ Electricity insights</span></span><button type="button" className={`detail-toggle ${technical ? "is-active" : ""}`} aria-pressed={technical} onClick={() => setTechnical(!technical)}><SlidersHorizontal size={16} /> {technical ? "Technical details on" : "Show technical details"}</button></div>
      <div id="page-content" tabIndex={-1}>{children}</div>
      <footer className="site-footer">
        <div><p>Developed by <strong>Zubair Ahmad</strong></p><a href="https://github.com/zubairahmad054" target="_blank" rel="noopener noreferrer">Explore more projects on my GitHub <ArrowUpRight size={14} /></a></div>
        <div className="footer-sources"><span>Built on open energy data</span><p><a href="https://carbonintensity.org.uk/" target="_blank" rel="noopener noreferrer">NESO</a> · <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · <a href="https://developer.octopus.energy/" target="_blank" rel="noopener noreferrer">Octopus Energy</a></p></div>
      </footer>
    </div>
  </DetailContext.Provider>
}

export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>
}
