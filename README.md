# VUS OnePortal

VUS OnePortal là cổng học tập mẫu cho học viên/phụ huynh, giáo viên và giáo vụ. Dự án là monorepo gồm Next.js App Router + TypeScript, FastAPI, PostgreSQL và Redis. Giao diện hỗ trợ tiếng Việt/tiếng Anh, hiển thị responsive và có manifest/service worker cho PWA.

## 1. Yêu cầu môi trường

### Cách chạy khuyến nghị: Docker Compose

Cần cài Docker Desktop và bật Docker Compose. Với cách này, Docker sẽ chạy frontend, backend, PostgreSQL và Redis; bạn không cần cài Python, Node.js, PostgreSQL hoặc Redis trực tiếp trên máy.

### Chạy frontend/backend trực tiếp trên máy

Nếu không chạy toàn bộ qua Docker, cần có:

- Python 3.11 trở lên cho backend.
- Node.js 20 trở lên và npm cho frontend.
- PostgreSQL 16 và Redis 7. Có thể chỉ chạy hai dịch vụ dữ liệu này bằng Docker Compose rồi chạy ứng dụng trực tiếp trên máy.

## 2. Chạy toàn bộ dự án bằng Docker

Mở PowerShell hoặc Terminal tại thư mục gốc dự án, nơi có `docker-compose.yml`, rồi chạy:

```powershell
docker compose up --build
```

Lần đầu chạy sẽ tải các image, cài package, áp dụng Alembic migration, khởi tạo dữ liệu demo và khởi động các dịch vụ. Quá trình này có thể mất vài phút. Giữ cửa sổ terminal mở khi chạy theo cách trên.

Khi các dịch vụ đã sẵn sàng, truy cập:

- Frontend tiếng Việt: [http://localhost:3000/vi](http://localhost:3000/vi)
- Frontend tiếng Anh: [http://localhost:3000/en](http://localhost:3000/en)
- Tài liệu API Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)
- API health check: [http://localhost:8000/health](http://localhost:8000/health)

Trong trang đăng nhập có ba nút đăng nhập nhanh. Tài khoản demo cũng có thể đăng nhập bằng mật khẩu chung `Demo123!`:

| Vai trò | Email |
| --- | --- |
| Phụ huynh / Học viên | `parent@vus.vn` |
| Giáo viên | `teacher@vus.vn` |
| Giáo vụ | `staff@vus.vn` |

### Các lệnh Docker thường dùng

Chạy ở chế độ nền:

```powershell
docker compose up --build -d
```

Xem trạng thái dịch vụ:

```powershell
docker compose ps
```

Xem log của toàn bộ dự án hoặc một dịch vụ:

```powershell
docker compose logs -f
docker compose logs -f backend
docker compose logs -f frontend
```

Dừng các container nhưng giữ dữ liệu PostgreSQL/Redis:

```powershell
docker compose down
```

Khởi động lại sau đó:

```powershell
docker compose up -d
```

Xóa toàn bộ dữ liệu demo và các volume cục bộ để tạo dữ liệu mới từ đầu:

```powershell
docker compose down -v
docker compose up --build
```

Lệnh `down -v` xóa dữ liệu PostgreSQL/Redis và các volume dependency/cache của dự án trên máy này.

## 3. Chạy PostgreSQL/Redis bằng Docker, ứng dụng chạy trực tiếp

Cách này hữu ích khi phát triển frontend/backend và muốn hot reload trực tiếp trên máy.

### Bước 1: Khởi động PostgreSQL và Redis

Tại thư mục gốc dự án:

```powershell
docker compose up -d db redis
```

PostgreSQL được mở tại `localhost:5432`, Redis tại `localhost:6379`. Cấu hình demo của PostgreSQL là database `vus_oneportal`, user `vus`, mật khẩu `vus_local_only`.

### Bước 2: Cài package Python và chạy backend

Từ thư mục gốc dự án, tạo môi trường ảo và cài các thư viện backend từ [requirements.txt](requirements.txt):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item backend/.env.example backend/.env
```

Mở `backend/.env` và đổi hai địa chỉ dịch vụ từ tên container sang `localhost`:

```dotenv
DATABASE_URL=postgresql+asyncpg://vus:vus_local_only@localhost:5432/vus_oneportal
REDIS_URL=redis://localhost:6379/0
```

Giữ `CORS_ORIGINS=http://localhost:3000` và `DEMO_MODE=true` khi chạy bản demo. Sau đó chạy backend:

```powershell
Set-Location backend
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend development sẽ tạo bảng còn thiếu và thêm tài khoản/dữ liệu demo khi khởi động. Giữ terminal này mở. Có thể kiểm tra backend tại [http://localhost:8000/health](http://localhost:8000/health) và mở Swagger tại [http://localhost:8000/docs](http://localhost:8000/docs).

### Bước 3: Cài package frontend và chạy Next.js

Mở terminal thứ hai tại thư mục gốc:

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Mở [http://localhost:3000/vi](http://localhost:3000/vi). Giá trị `NEXT_PUBLIC_API_URL` trong `frontend/.env.local` mặc định trỏ đến `http://localhost:8000/api/v1`.

Nếu PowerShell chặn kích hoạt môi trường ảo, dùng Command Prompt và chạy `.venv\Scripts\activate.bat` từ thư mục gốc. Có thể cài package mà không kích hoạt môi trường bằng `.venv\Scripts\python.exe -m pip install -r requirements.txt`.

## 4. Cấu hình môi trường

Các tệp `.env.example` là cấu hình mẫu được đưa vào Git. Tệp `.env`, `.env.local`, khóa và dữ liệu cục bộ bị bỏ qua bởi `.gitignore`.

### Backend: `backend/.env`

| Biến | Mục đích |
| --- | --- |
| `APP_ENV` | Đặt `development` khi phát triển cục bộ. Chế độ này khởi tạo bảng và dữ liệu demo. |
| `SECRET_KEY` | Khóa ký JWT. |
| `SENSITIVE_DATA_KEY` | Khóa riêng để mã hóa dữ liệu nhạy cảm bằng AES-GCM. |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL. Dùng hostname `db` trong Docker Compose; dùng `localhost` khi backend chạy trực tiếp trên máy. |
| `REDIS_URL` | Chuỗi kết nối Redis. Dùng `redis` trong Docker Compose; dùng `localhost` khi backend chạy trực tiếp trên máy. |
| `CORS_ORIGINS` | Các origin được phép gọi API, phân tách bằng dấu phẩy. Mặc định là `http://localhost:3000`. |
| `DEMO_MODE` | `true` bật dữ liệu/tác vụ demo và thanh toán giả lập; `false` tắt chúng. |
| `GEMINI_API_KEY` | Không bắt buộc. Thêm API key để gọi Gemini; bỏ trống để nhận gợi ý mẫu. |
| `GEMINI_MODEL` | Tên model Gemini, mặc định `gemini-3.8-flash`. |
| `PAYMENT_WEBHOOK_SECRET` | Khóa dùng xác thực chữ ký webhook thanh toán mẫu. |

Trong Docker Compose, `backend/.env.example` được nạp trước và `backend/.env` nếu có sẽ ghi đè các giá trị mẫu. Để sinh khóa ngẫu nhiên cho môi trường không phải demo, có thể chạy ba lần:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Gán kết quả lần lượt cho `SECRET_KEY`, `SENSITIVE_DATA_KEY` và `PAYMENT_WEBHOOK_SECRET`. Không commit các giá trị thật.

### Frontend: `frontend/.env.local`

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

Biến `NEXT_PUBLIC_API_URL` phải là địa chỉ mà trình duyệt của người dùng truy cập được. Khi chạy Docker Compose trên máy cá nhân, dùng `localhost`, không dùng hostname nội bộ `backend`.

## 5. Luồng demo

- **Phụ huynh/học viên:** xem lịch và hóa đơn, gửi đơn xin nghỉ trước giờ học ít nhất 4 tiếng, chọn lớp bù còn chỗ, gửi ticket cho giáo vụ. Có thể dùng nút điểm danh demo hoặc dán token đã giải mã từ QR của giáo viên.
- **Giáo viên:** chọn lớp, phát mã QR có chữ ký (hết hạn sau 60 giây), xem danh sách điểm danh cập nhật định kỳ, soạn và lưu nhận xét bằng tiếng Anh/tiếng Việt.
- **Giáo vụ:** lọc ticket, theo dõi SLA 8 giờ làm việc theo giờ TP.HCM (thứ Hai–thứ Sáu, 09:00–18:00) và cập nhật trạng thái xử lý.
- Chọn `VI / EN` trên thanh điều hướng để đổi ngôn ngữ.

## 6. Cấu trúc dự án

```text
vus-oneportal/
├── backend/
│   ├── app/api/                 # auth, student, teacher, staff, payments
│   ├── app/core/                # cấu hình, DB, JWT/RBAC, AES-GCM, Redis cache
│   ├── app/models.py            # SQLAlchemy models
│   ├── app/schemas.py           # Pydantic schemas
│   ├── app/seed.py              # tài khoản và dữ liệu demo
│   ├── alembic/                 # database migrations
│   ├── .env.example
│   └── pyproject.toml
├── frontend/
│   ├── src/app/[locale]/        # login và portal theo locale vi/en
│   ├── src/components/          # màn hình login, portal và PWA
│   ├── messages/                # từ điển vi/en
│   ├── public/                  # icon, service worker, trang offline
│   └── package.json
├── requirements.txt             # thư viện Python backend
├── docker-compose.yml
└── .gitignore
```

## 7. Xử lý lỗi thường gặp

### Cổng đã được sử dụng

Docker Compose cần các cổng `3000`, `8000`, `5432` và `6379`. Nếu cổng đang được ứng dụng khác sử dụng, dừng ứng dụng đó hoặc đổi vế trái trong `ports` của `docker-compose.yml` rồi truy cập cổng mới. Ví dụ `"3001:3000"` sẽ mở frontend tại `http://localhost:3001`.

### Frontend không gọi được API

Kiểm tra backend đang chạy và mở được [http://localhost:8000/health](http://localhost:8000/health). Kiểm tra `NEXT_PUBLIC_API_URL` trong `frontend/.env.local`; khi trình duyệt chạy trên máy cá nhân, địa chỉ phải bắt đầu bằng `http://localhost:8000/api/v1`.

### Backend không kết nối được PostgreSQL/Redis

Nếu backend chạy trong Docker, `DATABASE_URL` và `REDIS_URL` phải dùng hostname `db` và `redis`. Nếu backend chạy trực tiếp trên máy, dùng `localhost`. Có thể kiểm tra trạng thái dịch vụ bằng `docker compose ps` và log bằng `docker compose logs -f db redis backend`.

### Đăng nhập không thành công

Đợi backend khởi động xong và seed dữ liệu demo, sau đó thử nút đăng nhập nhanh trên trang. Nếu vẫn lỗi, xem `docker compose logs -f backend`; kiểm tra `APP_ENV=development` và `DEMO_MODE=true` trong cấu hình backend.

### Muốn làm mới dữ liệu demo

`docker compose down -v` xóa dữ liệu PostgreSQL/Redis và volume dependency/cache cục bộ. Chạy lại `docker compose up --build` để khởi tạo lại.

## 8. Giới hạn của bản demo

- Thanh toán chưa kết nối VNPAY/PayOS thật; nút thanh toán chỉ đổi trạng thái hóa đơn demo. Route webhook có kiểm tra HMAC làm điểm nối cho adapter của nhà cung cấp.
- QR động được hiển thị trên màn hình giáo viên. Giao diện hiện nhận token được giải mã/dán vào; camera scanner chưa được bật.
- Google SSO/OTP, email, PDF biên lai, upload học liệu và quản lý ticket nâng cao cần cấu hình dịch vụ/tài khoản triển khai.
- Khi không có Gemini API key, gợi ý nhận xét dùng nội dung mẫu.
- `create_all` chỉ tự tạo schema ở development. Khi triển khai môi trường khác, chạy Alembic migration trước khi khởi động backend.
- `DEMO_MODE=true`, mật khẩu demo và thông tin Postgres trong Compose chỉ dành cho máy phát triển; thay khóa và thông tin xác thực trước khi triển khai dùng thật.
