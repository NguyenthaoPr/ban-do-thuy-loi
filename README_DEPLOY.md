# Bản đồ Thủy lợi — V12

## Mục tiêu
- Giữ nguyên giao diện và logic Bản đồ Thủy lợi hiện có.
- GIS chạy độc lập từ `gis/master.geojson`, không phụ thuộc Render/Technical API.
- Không dùng Cache API cho GIS để tránh giữ bản GeoJSON cũ khi debug/deploy.
- Sửa lỗi `MultiPoint`.
- Hiển thị đầy đủ Placemark từ `master.kmz`, gồm Point, LineString, Polygon và MultiGeometry.

## Dữ liệu GIS
Nguồn `gis_master/master.kmz` có 15.197 Placemark. V12 chuyển trực tiếp từng Placemark thành một GeoJSON Feature, giữ cả 9 Polygon và 4 GeometryCollection.

## Cloudflare Workers Static Assets
`wrangler.toml` dùng:

```toml
[assets]
directory = "."
not_found_handling = "single-page-application"
```

Không tạo thư mục `public/`. Khi deploy phải có ít nhất:
- `index.html`
- `gis/master.geojson`

## Build lại GIS
Nếu thay `gis_master/master.kmz`, chạy:

```bash
npm install
npm run build
```

Sau đó kiểm tra `gis/master.geojson` có khoảng 15.197 features trước khi deploy.
