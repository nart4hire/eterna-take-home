# Product Context

A small distributor currently oversells while tracking inventory and invoices in spreadsheets. StockFlow makes inventory availability and invoice lifecycle reliable for each staff user's independent workspace.

Core UX: register/login; product search/pagination/CRUD; invoice creation with selectable lines/live totals; invoice list/filter/detail; issue, mark paid or cancel; draft item editing. Show actionable validation, pending/empty/error states. Simplicity and correctness outrank visual polish.

Drafts do not reserve stock. Issue consumes stock atomically; cancelling an issued invoice restores it once. Paid/cancelled invoices are terminal. Preserve historical product snapshots. Users cannot access another user's data. Planned assumption: USD display with integer cents, no currency selection. Document all assumptions in README.
