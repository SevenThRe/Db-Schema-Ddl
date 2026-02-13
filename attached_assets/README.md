# Test Files Directory

This directory is for storing test Excel files used during development.

## File Format Requirements

The application expects Excel files (`.xlsx` or `.xls`) with the following Japanese labels:

### Table Definition Structure

- **論理テーブル名** - Logical table name
- **物理テーブル名** - Physical table name

### Column Headers (Required)

The column header row must contain all of these labels:

- `No` - Column number
- `論理名` - Logical column name
- `物理名` - Physical column name
- `データ型` - Data type

### Optional Column Headers

- `Size` - Size/Length
- `Not Null` - NOT NULL constraint (検索 for "not null" text)
- `PK` - Primary key (marked with `〇` Japanese circle)
- `備考` - Comments/Remarks

## Example Layout

```
論理テーブル名    ユーザーマスタ
物理テーブル名    m_user

No  論理名        物理名       データ型    Size  Not Null  PK  備考
1   ユーザーID    user_id      INT               NOT NULL  〇  主键
2   ユーザー名    user_name    VARCHAR     100   NOT NULL      用户姓名
3   メール       email        VARCHAR     255
```

## Adding Test Files

1. Place your Excel files in this directory
2. The application will automatically detect them
3. Files in this directory are ignored by git (for security/privacy)

## Security Note

⚠️ **Do not commit actual database definition files to version control**

This directory is git-ignored to prevent accidentally committing sensitive data like:
- Internal database schemas
- Confidential business logic
- Proprietary data structures
