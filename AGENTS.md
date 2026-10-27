# Genesis · Office Admin (Figma Make)

Clickable prototype of the **Office Admin** portal (signed in as Emma Thompson). It is built from the Supervisor platform (`sadaqat786921/genesis-supervisor-platform`) for Landlord Service Plans (LSP) and keeps the same client-approved design, the client-approved design **"Dashboard Variation 04"** (Figma: Genesis page, node 342:2369, and the "Genesis · Design System" section). React 19 + Vite + TypeScript, running inside Figma Make.

## Do not redesign
The client has approved this design. When editing:
- Keep the layout: a 264px white sidebar card on the left (logo, 5 menu groups, live counts, the user at the bottom), with content on the right inside 24px page padding and 20px gaps between blocks.
- Keep the colours, font, radii and shadows listed below. Use the CSS variables in `src/styles/app.css` and never hard-code new colours.
- Keep the existing classes and components (`.card`, `.kpi`, `.chip`, `.btn`, `Drawer`, `Modal`, `Tabs` and so on). Add new screens by reusing them.
- Do not add Tailwind's base reset (preflight). `src/index.css` loads only Tailwind's theme and utilities, on purpose.
- Tailwind utilities are switched on, so never name a custom class after a Tailwind utility (`outline`, `ring`, `shadow`, `border`, `hidden`…). That is why the outline button uses the class `.btn.line` and the dashboard ring uses `.gring`.
- Do not swap the icon set (lucide-react, stroke width 1.8) or the font (Montserrat).
- Images are relative paths under `public/images/` (`images/home1.jpg`). Keep them as normal git files, not LFS.
- Besides React, only two packages are needed: `react-router-dom` and `lucide-react`. If an import fails, add the missing package to package.json — never delete screens or swap libraries.
- Routing uses `HashRouter`. Paths look like `#/landlords/L1`.

## Design tokens (`src/styles/app.css`)
| Token | Value |
|---|---|
| Font | Montserrat 400/500/600/700/800 (self-hosted in `src/fonts`, loaded by `src/styles/fonts.css` — no font package needed) |
| Page background | `#F3F5F9` |
| Surface (cards) | `#FFFFFF`, border `#E9EDF3`, radius 22, padding 20, shadow `0 8px 24px rgba(15,24,40,.04)` |
| Brand navy | `#153D91` (hover `#0F3279`, subtle `#EEF3FC`) |
| Deep navy (hero / inverse) | `#001649` |
| Accent green | `#5BAF00` |
| Text | primary `#0F1828`, secondary `#475467`, tertiary `#667085`, placeholder `#98A2B3` |
| Status | ok `#3C7300` / `#E8F4DB` · warning `#B54708` / `#FEF0C7` · error `#C8102E` / `#FDE8EB` · info `#0B6FB8` / `#E0F2FE` |
| Radius | 6, 8, 10, 12 (buttons and inputs), 14, 20 (sidebar), 22 (cards), 24 (hero), 999 (chips) |
| Type | H1 24/800 · H2 15/700 · metric 26/800 · body 13/500 · small 12.5/500 · caption 11/500 · hero number 56/800 |

## Office Admin rules (this portal)
- Signed in as `ME` = Emma Thompson (`src/data.ts`: `ME`, `ME_NAME`, `SUPERVISOR`). Demo login: any email/password, code `123456`.
- The store (`src/store.tsx`, `SCOPE`) loads only her work: her landlords and their homes, her client homes, her enquiries, applicants and tasks, and everything linked to those homes. She never sees other Office Admins' homes.
- Sidebar: My Work (My Day, My Tasks, Enquiries) · Homes & People · Work (Clients, Contractors, Jobs, Inspections) · Checks & Money (Safety, Rent & Invoices) · Supervisor & Records (Sent to Supervisor, My History). No Team Work, Sign-Ups, Approvals, Support Access or Reports.
- She CAN: contact enquiries, move home seekers to Lettings, run Lettings stages 1–4 and 6–7, price jobs under the limit, assign contractors, check photo proof, approve finished work, send invoices and quotes, book and lock inspections, upload certificates, record rent, send reminders and statements, add properties, generate Property Management Plans and job reports.
- Only the SUPERVISOR can (these go to **Sent to Supervisor**, `src/pages/Requests.tsx`): create landlords (duplicate check first), approve jobs over the landlord's limit, approve a tenant (Lettings stage 5), unlock locked records, change a plan, pause/resume/remove contractors, pay landlords.
- Each waiting request has a dashed "Prototype: the Supervisor's answer" box (`DemoAnswer`) so the next step of the flow can be shown without the Supervisor portal.

## Structure
- `src/main.tsx`: entry point. It wraps the app in HashRouter, then StoreProvider, then App, and loads `styles/fonts.css` (Montserrat), `index.css` and `styles/app.css`.
- `src/pages/Landing.tsx`: public website at `#/home` (Services with "Full management & Maintenance" highlighted, Plans, the Genesis platform shown as two phone mockups (landlord app home and tenant app home), About, Contact Us / "Join our Platform", FAQ; the header "Join Waitlist" button and portal buttons open a waitlist modal). Styles are the `.lp-` section at the end of `app.css`.
- `src/App.tsx`: the login gate (`#/login`), then the sidebar plus the page for the current route.
- `src/Shell.tsx`: sidebar menu (`NAV`), page header (global search, alerts, calendar), breadcrumbs and Login (sign in, then a 6-digit security code; demo code `123456`; 5 wrong tries lock the account).
- `src/ui.tsx`: shared UI. Chip, Btn, IBtn, Card, Avatar, Bar, Tabs, MiniSearch, Drawer, Modal, Field, Text, Select, KV, Note, Steps, Toasts, Reason (a modal that requires a reason), Kpi.
- `src/store.tsx`: shared demo state, plus `go(route, id)`, `toast()` and `log()`. Every action writes to Records & History.
- `src/data.ts`: sample data. Demo "today" is 15 Oct 2026.
- `src/pages/Today.tsx` is **My Day**, `Tasks.tsx` is **My Tasks**, `Requests.tsx` is **Sent to Supervisor** (requests, repair approvals, repair budgets), `Records.tsx` is **My History** (ask to unlock).
- `src/pages/` (every list row or card opens its own detail page at `#/<section>/<id>`):
  - `Enquiries.tsx`: list + detail (given to you → contacted → ask Supervisor to create landlord / move to Lettings, close with confirmation).
  - `Landlords.tsx`: list + detail (properties, safety checks with done date/time, inspections, jobs, invoices, communication).
  - `Lettings.tsx`: 7-stage kanban + applicant detail page.
  - `Tenants.tsx`: Live / Moving out / Moved out + tenant profile (rent, KYC, home, communication, issues, move-out).
  - `Properties.tsx`, `Clients.tsx` (letting agents), `Contractors.tsx`, `Jobs.tsx` (job page shared with Clients), `Inspections.tsx`, `Safety.tsx` (Compliance Centre), `Rent.tsx` (payouts are view-only).
  - `PropertyExtras.tsx`: property History (everything, earlier certificate versions kept) and Rent & invoices tabs. `PropertyPlan.tsx`: Property Management Plan (P1-10): check gaps → preview → save version → PDF; saved versions never change.
  - `docs.tsx`: the LSP paper template (`DocSheet`) used for quotes, invoices, job reports and plans; `QuoteBuilder` (line items), `InvoiceModal`, `JobReportModal`.
  - `shared.tsx`: flow helpers (approveJob, invoices) and shared modals. `tables.tsx`: shared certificate, inspection, job and invoice tables.
- `src/pages/Switch.tsx` (same file in both portals; `PORTAL` in `data.ts` decides who can do what): **Planned Switch** for landlords who already pay another agent. Board with 8 stages (New enquiry → Contact pending → Assessment → Decision: Ready to plan / Future switch / Needs clarification → Proposal sent → Agreement signed → Onboarding → Activated), lead page (current agent, notice dates marked Confirmed or Estimated, proposal with an optional switching credit for the Director, handover checklist), switching calendar (overdue, 30/60/90 days), closed leads, report (Supervisor). An enquiry moves in with "Move to Planned Switch"; the website Planned Switch form creates one lead (no duplicates). Only an activated switch creates a managed property. Supervisor approves onboarding and creates the landlord; an Office Admin asks for it.
- Plans are 10% (Management Only, no repairs included), 12%, 16% and 20%. Launch area is North London.
- `src/ui.tsx` also has the detail-page blocks: DetailHead, HSteps (horizontal steps), ActionCard ("Next step"), Stat, PageTabs, Timeline, CommsLog (calls/emails/notes with date and time), UploadModal, PhotoPicker.

## Rules the flows follow (from the client's flow chart)
- Only the Supervisor creates landlords. Before creating one, check for duplicates. Plans are 10% (Management Only, no repairs included), 12%, 16% and 20%, with job limits of £150, £200 and £300 for the last three. The login email is sent from Outlook.
- A job above the landlord's limit goes to Approvals. Approving it takes the cost off the yearly repair budget **once**. Alerts go out at 70%, 90% and 100%.
- There are two kinds of property:
  - **Managed:** belongs to a landlord; tenants, rent, safety checks and inspections apply.
  - **Unmanaged:** belongs to a letting agent; contractor services only, with a quote and then an invoice. The contractor's cost is visible to staff only.
- Lettings has seven stages: Applied (assign an Office Admin) → Contact (calls/emails logged, then portal login sent) → Screening (KYC uploaded on the portal, verified one by one, more documents can be asked for, profile approved or rejected) → Deposit & referencing (holding deposit, agreement signed, outside referencing) → Supervisor review → Move-in (date and time booked with the inspection) → Moved in (tenant account created). "Not going ahead" requires a reason.
- Tenants are Live, Moving out or Moved out. Move-out: notice → inspection booked → inspection done → deposit returned → moved out.
- Each property has its own yearly repair budget; a landlord's budget is the sum of their properties.
- Letting agents are called Clients. Contractors and Jobs are separate sidebar items.
- Every history line shows the date and time.
- Contractors with an expired certificate are paused and cannot be assigned. Finished jobs need photo proof. Approving a job sends the invoice and locks the record.
- Rent: staff record what arrived in the bank. Part payments carry forward and trigger a reminder email.
- Locked records (inspection reports and finished jobs) can only be unlocked with a reason. Earlier versions are kept.
- Support access is allowed for a set time, can be stopped at any moment, and everything the support team opens is logged.
