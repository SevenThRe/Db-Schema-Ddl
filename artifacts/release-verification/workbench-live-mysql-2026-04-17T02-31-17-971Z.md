# DB Workbench Live Verification mysql

- Run id: workbench-live-mysql-2026-04-17T02-31-17-971Z
- Generated at: 2026-04-17T02:31:17.971Z
- Evidence class: live-mysql
- Connection: bootstrap mysql
- Database: app
- Readonly: false
- Overall status: failed

## Flow Results

| Flow | Status | Note |
|------|--------|------|
| connect | failed | MySQL 连接失败: pool timed out while waiting for an open connection |
| query | skipped | No explicit evidence recorded for this flow in the current run. |
| paging | skipped | No explicit evidence recorded for this flow in the current run. |
| export | skipped | No explicit evidence recorded for this flow in the current run. |
| cancel | skipped | No explicit evidence recorded for this flow in the current run. |
| edit | skipped | No explicit evidence recorded for this flow in the current run. |
| readonly | skipped | No explicit evidence recorded for this flow in the current run. |
| inspection | skipped | No explicit evidence recorded for this flow in the current run. |

## Notes

- Live verification stopped before query flows because the connection could not be established.