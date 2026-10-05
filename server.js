require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { engine } = require('express-handlebars');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 1. Cấu hình Handlebars (Giao diện)
app.engine('hbs', engine({ extname: '.hbs' }));
app.set('view engine', 'hbs');

// 2. Chia luồng kết nối Đọc và Ghi
const connRead = mongoose.createConnection(process.env.MONGO_URI_READ);
const connWrite = mongoose.createConnection(process.env.MONGO_URI_WRITE);

connRead.on('connected', () => console.log('✓ Kết nối DB READ thành công'));
connRead.on('error', (err) => console.error('✗ Lỗi kết nối DB READ:', err.message));

connWrite.on('connected', () => console.log('✓ Kết nối DB WRITE thành công'));
connWrite.on('error', (err) => console.error('✗ Lỗi kết nối DB WRITE:', err.message));

// Cấu trúc bảng Dữ liệu
const bookSchema = new mongoose.Schema({
    productId: String,
    title: String,
    originalPrice: Number,
    priceAfterTax: Number
});

// Gán quyền cho từng luồng
const BookRead = connRead.model('Book', bookSchema);
const BookWrite = connWrite.model('Book', bookSchema);

// 3. Stateless Session lưu trực tiếp xuống Cloud Atlas
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI_WRITE,
        collectionName: 'sessions'
    })
}));

// 4. Logic cá nhân hóa (MSSV: 23IT264)
const MSSV = '23IT264';
const LAST_3_DIGITS = '264';
const VAT_PERCENT = 9; // Tính từ số cuối 4 + 5 = 9

// Luồng truy vấn ĐỌC (Render dữ liệu ra màn hình)
app.get('/', async (req, res) => {
    try {
        const books = await BookRead.find().lean();
        res.render('home', {
            books,
            name: "Trần Kim Thịnh",
            mssv: MSSV,
            vat: VAT_PERCENT
        });
    } catch (err) {
        res.status(500).send('Lỗi truy xuất dữ liệu');
    }
});

// Luồng truy vấn GHI (Thêm sách mới)
app.post('/add', async (req, res) => {
    const { productId, title, originalPrice } = req.body;

    // Bộ lọc: Mã SP phải có tiền tố 264
    if (!productId.startsWith(LAST_3_DIGITS)) {
        return res.send(`<h3>Từ chối: Mã sản phẩm phải bắt đầu bằng ${LAST_3_DIGITS}</h3><a href="/">Quay lại</a>`);
    }

    // Tính giá sau thuế tự động
    const price = parseFloat(originalPrice);
    const priceAfterTax = price + (price * VAT_PERCENT / 100);

    try {
        await BookWrite.create({ productId, title, originalPrice: price, priceAfterTax });
        res.redirect('/');
    } catch (err) {
        res.status(500).send('Lỗi lưu dữ liệu');
    }
});

app.listen(process.env.PORT, () => {
    console.log('Server chạy tại: http://localhost:' + process.env.PORT);
});

// database