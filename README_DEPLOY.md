# BẢN ĐỒ THỦY LỢI — DIRECT AI_DATA

Phiên bản độc lập của mô-đun Bản đồ Thủy lợi.

## Kiến trúc
- GIS: đọc trực tiếp `./gis/master.geojson`.
- Quan trắc: đọc trực tiếp Google Sheets `AI_DATA` qua GViz CSV.
- Không dùng Technical Vercel cho LIVE/Chart.
- Không dùng Worker trung gian cho AI_DATA.
- Thời tiết: Open-Meteo theo tọa độ công trình.
- Z–F–V–Q: ưu tiên dữ liệu AI_DATA; F/V có thể lấy từ GIS properties.
- Cache AI_DATA trong trình duyệt 60 giây; biểu đồ 48 giờ.

## Deploy Cloudflare Pages
- Framework: None / No framework
- Build command: `npm run build`
- Build output directory: `.`
- Production branch: `main`

## Deploy Render Static Site
- Build command: `npm run build`
- Publish directory: `.`

## AI_DATA
Nguồn mặc định được cấu hình trong `index.html`:
`https://docs.google.com/spreadsheets/d/1SJU9aCRZGWeAeHw6UfY_08HK8-A34kIlnrEiPJNEnko/gviz/tq?tqx=out:csv&gid=1866404435&tq=select%20*`

Có thể đổi bằng:
`window.THULYLOI_AI_DATA_URL = 'URL_MOI';`

## Lưu ý
Google Sheet phải cho phép truy cập dữ liệu phù hợp để trình duyệt đọc GViz CSV. Nếu trình duyệt chặn CORS, cần dùng một lớp proxy/serverless riêng; bản này không tự động quay lại Vercel/Worker.


## V10 — LIVE AI_DATA AUTO REFRESH
- Bản đồ đọc quan trắc trực tiếp từ `AI_DATA` qua GViz CSV.
- Popup đang mở tự làm mới mỗi 60 giây và buộc lấy dữ liệu mới.
- Cảnh báo hồ tự kiểm tra lại mỗi 2 phút khi bản đồ đang hiển thị.
- Khi tab bị ẩn, App không chạy vòng cập nhật; quay lại sẽ kiểm tra lại dữ liệu.
- Có trạng thái LIVE/đang cập nhật/lỗi tạm thời trên giao diện.
- Có fallback dữ liệu phiên gần nhất trong `sessionStorage` khi Google Sheets hoặc mạng lỗi tạm thời.
- Không phụ thuộc Technical Vercel/Worker cho LIVE/Chart.

### Luồng dữ liệu V10
`AI_DATA → GViz CSV → Browser → Live Engine → Popup/Cảnh báo`

### Chu kỳ
- Popup đang mở: **60 giây**.
- Cảnh báo hồ: **2 phút**.
- Cache AI_DATA nội bộ: **60 giây**; lần refresh Popup dùng `force=true`.
