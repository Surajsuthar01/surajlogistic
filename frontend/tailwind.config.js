/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'green-blue-crayola': 'hsl(202, 75%, 47%)',
                'prussian-blue': 'hsl(202, 72%, 15%)',
                'eerie-black': 'hsl(210, 11%, 15%)',
                'dark-orange': 'hsl(205, 59%, 54%)',
                'alice-blue': 'hsl(203, 100%, 97%)',
                'light-gray': 'hsl(0, 0%, 80%)',
                'indigo-dye': 'hsl(202, 64%, 26%)',
                'cultured-1': 'hsl(0, 0%, 94%)',
                'cultured-2': 'hsl(0, 0%, 95%)',
                'cultured-3': 'hsl(0, 0%, 95%)',
                'plutinum': 'hsl(0, 0%, 91%)',
                'black_60': 'hsla(0, 0%, 0%, 0.6)',
                'onyx': 'hsl(0, 0%, 24%)',
            },
            fontFamily: {
                oswald: ['Oswald', 'sans-serif'],
                rubik: ['Rubik', 'sans-serif'],
            },
            boxShadow: {
                '1': '2px 0 50px hsla(0, 0%, 0%, 0.2)',
                '2': '0px 40px 60px hsla(202, 75%, 47%, 0.7)',
                '3': '0px 0px 60px hsla(202, 75%, 47%, 0.5)',
            }
        },
    },
    plugins: [],
}
