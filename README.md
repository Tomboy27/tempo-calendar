# FlowSavvy (Tempo Calendar)

A personal scheduling app that auto-schedules tasks into open time slots. Built with React, Vite, TypeScript, Tailwind CSS v4, and Supabase.

## Features

- **Google Calendar integration** — Connect your Google Calendar to import events and sync scheduled tasks
- **Task management** — Create, edit, delete tasks with duration, priority, due dates, and preferences
- **Smart scheduling** — Auto-schedules tasks into available time slots, respecting busy blocks, buffers, and working hours
- **Dependency-aware scheduling** — Tasks with dependencies are ordered via topological sort; cycles are detected and reported
- **Scheduling profiles** — Define per-day time windows (e.g. "Work" profile: Mon–Fri 9–17, "Study" profile: evenings)
- **Locked vs flexible tasks** — Lock tasks to fixed time slots; flexible tasks can be rescheduled around conflicts
- **Missed task detection** — Identifies overdue tasks and reschedules them automatically
- **Conflict detection** — Detects conflicts between scheduled tasks and Google Calendar events
- **Batch rescheduling** — Moves conflicting tasks to open slots automatically
- **Task state badges** — Visual indicators for locked, manual, missed, and deadline tasks
- **Calendar views** — Week, day, month, and agenda views via react-big-calendar

## Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript 6
- **Styling**: Tailwind CSS v4 + shadcn-style primitives
- **Backend**: Supabase (PostgreSQL)
- **Calendar**: react-big-calendar + date-fns v4
- **Auth**: Google Identity Services (GIS) OAuth2
- **Components**: Radix UI primitives (Dialog, Sheet, NavigationMenu, Slot)

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A Supabase project
- A Google Cloud Console project with Calendar API enabled

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Fill in your environment variables:
   - `VITE_SUPABASE_URL` — Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Your Supabase anonymous key
   - `VITE_GOOGLE_CLIENT_ID` — Your Google OAuth client ID
5. Run the Supabase migrations:
   - Open your Supabase project SQL editor
   - Run `supabase/migrations/001_create_tasks.sql`
   - Run `supabase/migrations/003_add_task_lists_scheduling_profiles.sql`
6. Start the dev server:
   ```bash
   npm run dev
   ```
7. Open http://localhost:5173

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project or select existing
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Web application type)
5. Add your deployment URL to Authorized JavaScript origins (e.g. `https://your-app.vercel.app`)
6. Copy the Client ID to your `.env` as `VITE_GOOGLE_CLIENT_ID`

## Deployment

### Vercel (Recommended)

**Option A: GitHub integration (auto-deploys on push)**
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`
4. Deploy

**Option B: CLI**
```bash
vercel login
vercel --prod --yes
```

### Other Platforms

The app builds to a static `dist/` folder. Any static hosting (Netlify, Cloudflare Pages, GitHub Pages) works.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |

## Project Structure

```
src/
  components/       # React components
    ui/             # shadcn-style primitives (Button, Sheet, Card, etc.)
    BigCalendar.tsx # Main calendar view (react-big-calendar) with event state classes
    Header.tsx      # App header with navigation
    TaskList.tsx    # Task list view with state badges
    TaskDialog.tsx  # Task create/edit dialog with scheduling fields
    WeeklyCalendar.tsx # Mini sidebar calendar
    GoogleConnect.tsx  # Google Calendar connect/disconnect
  hooks/
    useTasks.ts     # Task state management + scheduling integration
    useGoogleCalendar.ts  # Google Calendar events
  lib/
    tasks.ts        # Supabase task CRUD
    scheduler.ts    # Scheduling engine: dependency-aware, profile-aware, 8-week horizon
    rescheduler.ts  # Conflict detection + batch rescheduling
    sync.ts         # Google Calendar sync
    google.ts       # Google API utilities
    types.ts        # TypeScript type definitions (Task, TaskDependency, SchedulingProfile, etc.)
    supabase.ts     # Supabase client
    utils.ts        # cn() helper (clsx + tailwind-merge)
  index.css         # Global styles, CSS variables, calendar theme, event visual states
supabase/
  migrations/
    001_create_tasks.sql              # Base tasks table
    002_delete_old_habits.sql         # Cleanup
    003_add_task_lists_scheduling_profiles.sql  # Task lists, scheduling profiles, dependencies, locked/status fields
```

## Architecture

### Task States
- **Active** → `is_scheduled=false` — Eligible for auto-scheduling
- **Scheduled** → `is_scheduled=true` — Placed on calendar
- **Locked** → `is_locked=true` — Fixed position, not rescheduled
- **Missed** → `scheduled_end` is past — Rescheduled automatically

### Scheduling Engine
1. Fetches unscheduled tasks + Google Calendar events
2. Detects dependency cycles (DFS)
3. Topologically sorts tasks respecting dependencies
4. Filters to auto-schedulable tasks (`status=active`, `auto_schedule=true`)
5. For each task: finds available slots within scheduling horizon, respects profiles/buffers/blocked times
6. Picks best slot based on priority and preferred time windows
7. Returns structured output (scheduled, unscheduled, conflicts, dependency errors)

### Calendar Event Visual States
- `.event-task` — Task events (primary color)
- `.event-google` — External events (neutral, read-only)
- `.event-locked` — Locked tasks (green, lock icon)
- `.event-missed` — Overdue tasks (orange/red)
- `.event-flexible` — Reschedulable tasks (dashed border)

## Known Limitations

- Drag-and-drop event resizing is not currently implemented (react-big-calendar DnD addon has Vite ESM compatibility issues)
- Google Calendar fetch window is limited to 7 days
- Recurring tasks are scheduled as individual instances rather than recurring Google Calendar events

## License

MIT