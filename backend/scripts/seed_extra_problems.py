import os
import sys
import asyncio
import uuid
from pathlib import Path
from sqlalchemy import select

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.core.config import settings
from app.models.problem import Problem
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

EXTRA_PROBLEMS = {
    # CO (Constants)
    "temp-converter-const": {
        "title": "Temperature Converter (Constants)",
        "kc_tags": "CO",
        "description_en": "Write a program that converts Fahrenheit to Celsius using constant scale factors.\nUse const scale = 1.8 and const offset = 32.0.\nRead temperature in Fahrenheit, compute, and write Celsius.",
        "description_id": "Tulis program yang mengonversi Fahrenheit ke Celsius menggunakan faktor skala konstanta.\nGunakan const scale = 1.8 dan const offset = 32.0.\nBaca suhu dalam Fahrenheit, hitung, dan tampilkan Celsius.",
        "starter_code": "program TempConverter\ndictionary\n    const scale = 1.8\n    const offset = 32.0\n    f, c : real\nalgorithm\n    read f\n    c <- (f - offset) / scale\n    write c\nendprogram",
        "test_cases": [
            {"input": "32.0\n", "expected": "0.0"},
            {"input": "212.0\n", "expected": "100.0"}
        ]
    },
    "tax-calculator-const": {
        "title": "Tax Calculator (Constants)",
        "kc_tags": "CO",
        "description_en": "Write a program that computes tax using a constant tax rate const tax_rate = 0.15.\nRead total amount, compute tax, and output.",
        "description_id": "Tulis program yang menghitung pajak menggunakan tarif pajak konstanta const tax_rate = 0.15.\nBaca jumlah total, hitung pajak, dan tampilkan.",
        "starter_code": "program TaxCalculator\ndictionary\n    const tax_rate = 0.15\n    total, tax : real\nalgorithm\n    read total\n    tax <- total * tax_rate\n    write tax\nendprogram",
        "test_cases": [
            {"input": "100.0\n", "expected": "15.0"},
            {"input": "250.0\n", "expected": "37.5"}
        ]
    },
    # VA (Variables)
    "simple-accumulator": {
        "title": "Simple Accumulator",
        "kc_tags": "VA",
        "description_en": "Read three integers, add them to a sum variable, and write the final sum.",
        "description_id": "Baca tiga integer, tambahkan ke variabel sum, dan tampilkan jumlah akhirnya.",
        "starter_code": "program SimpleAccumulator\ndictionary\n    a, b, c, sum : integer\nalgorithm\n    read a\n    read b\n    read c\n    sum <- a + b + c\n    write sum\nendprogram",
        "test_cases": [
            {"input": "1\n2\n3\n", "expected": "6"},
            {"input": "-1\n5\n10\n", "expected": "14"}
        ]
    },
    "variable-assign": {
        "title": "Variable Reassignment",
        "kc_tags": "VA",
        "description_en": "Read an integer, assign it to a variable, double it, add 5, and write.",
        "description_id": "Baca sebuah integer, simpan ke variabel, kalikan dua, tambah 5, dan tampilkan.",
        "starter_code": "program VariableAssign\ndictionary\n    x, val : integer\nalgorithm\n    read x\n    val <- x * 2\n    val <- val + 5\n    write val\nendprogram",
        "test_cases": [
            {"input": "5\n", "expected": "15"},
            {"input": "0\n", "expected": "5"}
        ]
    },
    # OP (Operators)
    "remainder-calc": {
        "title": "Remainder Calculator",
        "kc_tags": "OP",
        "description_en": "Read two integers (dividend and divisor) and write the division remainder using modulo.",
        "description_id": "Baca dua integer (dividend dan divisor) dan tampilkan sisa pembagian menggunakan modulo.",
        "starter_code": "program RemainderCalc\ndictionary\n    a, b, rem : integer\nalgorithm\n    read a\n    read b\n    rem <- a % b\n    write rem\nendprogram",
        "test_cases": [
            {"input": "10\n3\n", "expected": "1"},
            {"input": "25\n5\n", "expected": "0"}
        ]
    },
    "arithmetic-mix": {
        "title": "Mixed Arithmetic",
        "kc_tags": "OP",
        "description_en": "Read two integers a and b, compute (a + b) * (a - b), and write the result.",
        "description_id": "Baca dua integer a dan b, hitung (a + b) * (a - b), dan tampilkan hasilnya.",
        "starter_code": "program ArithmeticMix\ndictionary\n    a, b, result : integer\nalgorithm\n    read a\n    read b\n    result <- (a + b) * (a - b)\n    write result\nendprogram",
        "test_cases": [
            {"input": "5\n3\n", "expected": "16"},
            {"input": "2\n2\n", "expected": "0"}
        ]
    },
    # EX (Expressions)
    "linear-eval": {
        "title": "Linear Evaluator",
        "kc_tags": "EX",
        "description_en": "Evaluate y = 5 * x + 10 for a given integer x.",
        "description_id": "Evaluasi y = 5 * x + 10 untuk nilai integer x yang diberikan.",
        "starter_code": "program LinearEval\ndictionary\n    x, y : integer\nalgorithm\n    read x\n    y <- 5 * x + 10\n    write y\nendprogram",
        "test_cases": [
            {"input": "2\n", "expected": "20"},
            {"input": "-2\n", "expected": "0"}
        ]
    },
    "volume-box": {
        "title": "Volume of Box",
        "kc_tags": "EX",
        "description_en": "Read length, width, and height as integers and write the volume (length * width * height).",
        "description_id": "Baca panjang, lebar, dan tinggi sebagai integer dan tampilkan volumenya (panjang * lebar * tinggi).",
        "starter_code": "program VolumeBox\ndictionary\n    length, width, height, vol : integer\nalgorithm\n    read length\n    read width\n    read height\n    vol <- length * width * height\n    write vol\nendprogram",
        "test_cases": [
            {"input": "3\n4\n5\n", "expected": "60"},
            {"input": "10\n10\n10\n", "expected": "1000"}
        ]
    },
    # IO (Input/Output)
    "echo-message": {
        "title": "Echo Message",
        "kc_tags": "IO",
        "description_en": "Read a string message from stdin and write it back.",
        "description_id": "Baca pesan string dari stdin dan tampilkan kembali.",
        "starter_code": "program EchoMessage\ndictionary\n    msg : string\nalgorithm\n    read msg\n    write msg\nendprogram",
        "test_cases": [
            {"input": "Hello\n", "expected": "Hello"},
            {"input": "Testing\n", "expected": "Testing"}
        ]
    },
    "double-io": {
        "title": "Double IO",
        "kc_tags": "IO",
        "description_en": "Read an integer and output 'Input is: [x]' followed by the integer.",
        "description_id": "Baca sebuah integer dan tampilkan 'Input is: [x]' diikuti dengan integer tersebut.",
        "starter_code": "program DoubleIO\ndictionary\n    x : integer\nalgorithm\n    read x\n    write x\nendprogram",
        "test_cases": [
            {"input": "42\n", "expected": "42"}
        ]
    },
    # CD (Conditionals)
    "sign-checker": {
        "title": "Sign Checker",
        "kc_tags": "CD",
        "description_en": "Read an integer. Write 1 if positive, -1 if negative, and 0 if zero.",
        "description_id": "Baca sebuah integer. Tampilkan 1 jika positif, -1 jika negatif, dan 0 jika nol.",
        "starter_code": "program SignChecker\ndictionary\n    x, res : integer\nalgorithm\n    read x\n    if x > 0 then\n        res <- 1\n    elif x < 0 then\n        res <- -1\n    else\n        res <- 0\n    endif\n    write res\nendprogram",
        "test_cases": [
            {"input": "5\n", "expected": "1"},
            {"input": "-10\n", "expected": "-1"},
            {"input": "0\n", "expected": "0"}
        ]
    },
    "grade-classifier": {
        "title": "Grade Classifier",
        "kc_tags": "CD",
        "description_en": "Read a score (0-100). If >= 80 write A, else if >= 60 write B, else write C.",
        "description_id": "Baca nilai (0-100). Jika >= 80 tampilkan A, jika >= 60 tampilkan B, selain itu tampilkan C.",
        "starter_code": "program GradeClassifier\ndictionary\n    score : integer\n    grade : string\nalgorithm\n    read score\n    if score >= 80 then\n        grade <- \"A\"\n    elif score >= 60 then\n        grade <- \"B\"\n    else\n        grade <- \"C\"\n    endif\n    write grade\nendprogram",
        "test_cases": [
            {"input": "85\n", "expected": "A"},
            {"input": "70\n", "expected": "B"},
            {"input": "50\n", "expected": "C"}
        ]
    },
    # LO (Loops)
    "count-up": {
        "title": "Count Up to N",
        "kc_tags": "LO",
        "description_en": "Read an integer n and write numbers from 1 to n in sequence.",
        "description_id": "Baca sebuah integer n dan tampilkan angka dari 1 sampai n secara berurutan.",
        "starter_code": "program CountUp\ndictionary\n    n, i : integer\nalgorithm\n    read n\n    i <- 1\n    while i <= n do\n        write i\n        i <- i + 1\n    endwhile\nendprogram",
        "test_cases": [
            {"input": "3\n", "expected": "1\n2\n3"}
        ]
    },
    "count-down": {
        "title": "Count Down from N",
        "kc_tags": "LO",
        "description_en": "Read an integer n and write numbers from n down to 1 in sequence.",
        "description_id": "Baca sebuah integer n dan tampilkan angka dari n turun sampai 1 secara berurutan.",
        "starter_code": "program CountDown\ndictionary\n    n : integer\nalgorithm\n    read n\n    while n >= 1 do\n        write n\n        n <- n - 1\n    endwhile\nendprogram",
        "test_cases": [
            {"input": "3\n", "expected": "3\n2\n1"}
        ]
    }
}

# Add standard KC tags for existing problems to update them
EXISTING_PROBLEMS_KCS = {
    "swap-variables": "VA",
    "factorial": "LO",
    "circle-calc": "CO",
    "even-odd": "OP",
    "quadratic-eval": "EX",
    "greeting-gen": "IO",
    "max-three": "CD",
    "sum-n": "LO,VA",
    "sum-evens": "CD,LO,EX"
}

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

async def main():
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        print("Updating existing problems with KC tags...")
        for key, tags in EXISTING_PROBLEMS_KCS.items():
            stmt = select(Problem).where(Problem.key == key)
            res = await session.execute(stmt)
            prob = res.scalar_one_or_none()
            if prob:
                prob.kc_tags = tags
                print(f"Updated {key} with tags: {tags}")

        print("\nSeeding extra problems...")
        for key, p_data in EXTRA_PROBLEMS.items():
            stmt = select(Problem).where(Problem.key == key)
            res = await session.execute(stmt)
            prob = res.scalar_one_or_none()
            if not prob:
                new_prob = Problem(
                    id=uuid.uuid4(),
                    key=key,
                    title=p_data["title"],
                    kc_tags=p_data["kc_tags"],
                    description_en=p_data["description_en"],
                    description_id=p_data["description_id"],
                    starter_code=p_data["starter_code"],
                    test_cases=p_data["test_cases"]
                )
                session.add(new_prob)
                print(f"Created extra problem: {key}")
            else:
                prob.kc_tags = p_data["kc_tags"]
                prob.title = p_data["title"]
                prob.description_en = p_data["description_en"]
                prob.description_id = p_data["description_id"]
                prob.starter_code = p_data["starter_code"]
                prob.test_cases = p_data["test_cases"]
                print(f"Updated extra problem: {key}")

        await session.commit()
        print("\nExtra problems seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
