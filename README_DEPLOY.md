# BẢN ĐỒ THỦY LỢI — VERCEL

Đây là bản sao độc lập từ `ThuyLoiAI-main(2)`.

## Nguyên tắc
- Không thay đổi logic GIS, Search, Popup, Technical, AI và dữ liệu của App gốc.
- Phần giao diện Chat AI được ẩn bằng CSS; DOM và JS gốc vẫn được giữ lại để không phá kiến trúc.
- Bản đồ được mở tự động khi truy cập website.
- GIS vẫn lấy dữ liệu từ Render backend hiện tại.
- Technical API vẫn sử dụng Vercel Technical backend hiện tại.

## Deploy
1. Tạo một repository GitHub mới.
2. Upload toàn bộ 2 file `index.html` và `vercel.json`.
3. Vào Vercel → Add New Project → Import repository.
4. Framework Preset: `Other`.
5. Build Command: để trống.
6. Output Directory: `.`.
7. Deploy.

## Backend hiện tại
- GIS: `https://thuyloiai.onrender.com`
- Technical: `https://thuyloiai-technical-vercel.vercel.app`

Nếu đổi backend sau này, chỉnh các URL/API ở đầu phần JavaScript gốc trong `index.html`.
