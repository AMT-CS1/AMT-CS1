import os
import sys
import argparse
import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from sqlalchemy import select, delete

# Add backend directory to sys.path so we can import app modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.core.config import settings
from app.core.security import get_password_hash
from app.core.kcs import K_COMPONENTS
from app.models import Base, User, WeeklyTarget, Problem, HintQuizQuestion, QuizProgress, Attempt, StudentModelState
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

DEFAULT_PROBLEMS = {
    "swap-variables": {
        "title": "Variable Swapping",
        "description_en": (
            "Write a program that swaps the values of two variables, `x` and `y`.\n\n"
            "**Instructions:**\n"
            "1. Read two integers from the input into `x` and `y` respectively.\n"
            "2. Swap their values (use the temporary variable `temp` defined in the dictionary).\n"
            "3. Output the value of `x` and then `y` using the `write` statement.\n\n"
            "**Example:**\n"
            "If the input is `12` and `85`, the output must be:\n"
            "```\n"
            "85\n"
            "12\n"
            "```"
        ),
        "description_id": (
            "Tulis program yang menukar nilai dari dua variabel, `x` dan `y`.\n\n"
            "**Instruksi:**\n"
            "1. Baca dua integer dari input ke `x` dan `y` masing-masing.\n"
            "2. Tukar nilai keduanya (gunakan variabel sementara `temp` yang didefinisikan di dalam dictionary).\n"
            "3. Tampilkan nilai dari `x` dan kemudian `y` menggunakan statement `write`.\n\n"
            "**Contoh:**\n"
            "Jika input adalah `12` dan `85`, output harus berupa:\n"
            "```\n"
            "85\n"
            "12\n"
            "```"
        ),
        "starter_code": (
            "program SwapVariables\n"
            "dictionary\n"
            "    x, y, temp : integer\n"
            "algorithm\n"
            "    read x\n"
            "    read y\n"
            "    \n"
            "    // Write your swapping logic here:\n"
            "    \n"
            "    \n"
            "    write x\n"
            "    write y\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "5\n10\n", "expected": "10\n5"},
            {"input": "-3\n42\n", "expected": "42\n-3"},
            {"input": "100\n100\n", "expected": "100\n100"}
        ]
    },
    "factorial": {
        "title": "Factorial Calculator",
        "description_en": (
            "Write a program that reads a non-negative integer `n` and computes its factorial (n!).\n\n"
            "**Instructions:**\n"
            "1. Read the value of `n` from the input.\n"
            "2. Compute `n * (n-1) * ... * 1` and store it in `fact`.\n"
            "3. If `n` is `0`, the factorial is defined as `1`.\n"
            "4. Output the final value of `fact`.\n\n"
            "**Example:**\n"
            "If the input is `5`, the output must be `120`."
        ),
        "description_id": (
            "Tulis program yang membaca integer non-negatif `n` dan menghitung faktorialnya (n!).\n\n"
            "**Instruksi:**\n"
            "1. Baca nilai `n` dari input.\n"
            "2. Hitung `n * (n-1) * ... * 1` dan simpan hasilnya di `fact`.\n"
            "3. Jika `n` adalah `0`, faktorial didefinisikan sebagai `1`.\n"
            "4. Tampilkan nilai akhir dari `fact`.\n\n"
            "**Contoh:**\n"
            "Jika input adalah `5`, output harus berupa `120`."
        ),
        "starter_code": (
            "program Factorial\n"
            "dictionary\n"
            "    n, fact, i : integer\n"
            "algorithm\n"
            "    read n\n"
            "    fact <- 1\n"
            "    i <- 1\n"
            "    \n"
            "    // Write a loop here to compute the factorial:\n"
            "    \n"
            "    \n"
            "    write fact\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "5\n", "expected": "120"},
            {"input": "0\n", "expected": "1"},
            {"input": "3\n", "expected": "6"},
            {"input": "7\n", "expected": "5040"}
        ]
    },
    "circle-calc": {
        "title": "Circle Calculator",
        "description_en": (
            "Write a program that reads the radius `r` of a circle (as a real number) and calculates its area and circumference using the constant `pi = 3.14159`.\n\n"
            "**Instructions:**\n"
            "1. Declare a constant `pi` with value `3.14159`.\n"
            "2. Read the real number `r` from the input.\n"
            "3. Calculate the area (`pi * r^2`) and circumference (`2.0 * pi * r`).\n"
            "4. Output the area and then the circumference (each on a new line)."
        ),
        "description_id": (
            "Tulis program yang membaca jari-jari `r` dari sebuah lingkaran (sebagai bilangan real) dan menghitung luas serta kelilingnya menggunakan konstanta `pi = 3.14159`.\n\n"
            "**Instruksi:**\n"
            "1. Deklarasikan konstanta `pi` dengan nilai `3.14159`.\n"
            "2. Baca bilangan real `r` dari input.\n"
            "3. Hitung luas (`pi * r^2`) dan keliling (`2.0 * pi * r`).\n"
            "4. Tampilkan luas, kemudian keliling (masing-masing di baris baru)."
        ),
        "starter_code": (
            "program CircleCalculator\n"
            "dictionary\n"
            "    const pi = 3.14159\n"
            "    r, area, circum : real\n"
            "algorithm\n"
            "    read r\n"
            "    \n"
            "    // Calculate area and circumference here:\n"
            "    \n"
            "    \n"
            "    write area\n"
            "    write circum\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "1.0\n", "expected": "3.14159\n6.28318"},
            {"input": "2.0\n", "expected": "12.56636\n12.56636"}
        ]
    },
    "even-odd": {
        "title": "Even Odd Checker",
        "description_en": (
            "Write a program that reads an integer `n` and checks if it is even or odd using the modulo operator `%`.\n\n"
            "**Instructions:**\n"
            "1. Read the integer `n` from the input.\n"
            "2. Use the modulo `%` operator to check if `n % 2 == 0`.\n"
            "3. If it is even, output `1`, otherwise output `0`."
        ),
        "description_id": (
            "Tulis program yang membaca sebuah integer `n` dan memeriksa apakah bilangan tersebut genap atau ganjil menggunakan operator modulo `%`.\n\n"
            "**Instruksi:**\n"
            "1. Baca integer `n` dari input.\n"
            "2. Gunakan operator modulo `%` untuk memeriksa apakah `n % 2 == 0`.\n"
            "3. Jika genap, tampilkan `1`, jika tidak tampilkan `0`."
        ),
        "starter_code": (
            "program EvenOddChecker\n"
            "dictionary\n"
            "    n, result : integer\n"
            "algorithm\n"
            "    read n\n"
            "    \n"
            "    // Write your check here using modulo operator:\n"
            "    \n"
            "    \n"
            "    write result\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "4\n", "expected": "1"},
            {"input": "7\n", "expected": "0"},
            {"input": "0\n", "expected": "1"}
        ]
    },
    "quadratic-eval": {
        "title": "Quadratic Evaluator",
        "description_en": (
            "Write a program that evaluates the expression `y = 3*x^2 + 5*x - 2` for a given integer value `x`.\n\n"
            "**Instructions:**\n"
            "1. Read the integer `x` from the input.\n"
            "2. Compute `y` using the mathematical operators (exponentiation `^`, multiplication `*`, addition `+`, subtraction `-`).\n"
            "3. Output the value of `y`."
        ),
        "description_id": (
            "Tulis program yang mengevaluasi ekspresi `y = 3*x^2 + 5*x - 2` untuk nilai integer `x`.\n\n"
            "**Instruksi:**\n"
            "1. Baca integer `x` dari input.\n"
            "2. Hitung `y` menggunakan operator matematika (eksponen `^`, perkalian `*`, penjumlahan `+`, pengurangan `-`).\n"
            "3. Tampilkan nilai dari `y`."
        ),
        "starter_code": (
            "program QuadraticEvaluator\n"
            "dictionary\n"
            "    x, y : integer\n"
            "algorithm\n"
            "    read x\n"
            "    \n"
            "    // Evaluate the expression y = 3*x^2 + 5*x - 2 here:\n"
            "    \n"
            "    \n"
            "    write y\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "2\n", "expected": "20"},
            {"input": "0\n", "expected": "-2"},
            {"input": "-1\n", "expected": "-4"}
        ]
    },
    "greeting-gen": {
        "title": "Greeting Generator",
        "description_en": (
            "Write a program that reads a user's name and age, and prints a greeting message.\n\n"
            "**Instructions:**\n"
            "1. Read a string `name` and an integer `age` from the input.\n"
            "2. Output the exact message: `Hello [name], you are [age] years old!` using the `write` statement."
        ),
        "description_id": (
            "Tulis program yang membaca nama dan umur pengguna, lalu menampilkan pesan sapaan.\n\n"
            "**Instruksi:**\n"
            "1. Baca string `name` dan integer `age` dari input.\n"
            "2. Tampilkan pesan tepat: `Hello [name], you are [age] years old!` menggunakan statement `write`."
        ),
        "starter_code": (
            "program GreetingGenerator\n"
            "dictionary\n"
            "    name : string\n"
            "    age : integer\n"
            "algorithm\n"
            "    read name\n"
            "    read age\n"
            "    \n"
            "    // Write the output statement here:\n"
            "    \n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "John\n25\n", "expected": "Hello John, you are 25 years old!"},
            {"input": "Alice\n18\n", "expected": "Hello Alice, you are 18 years old!"}
        ]
    },
    "max-three": {
        "title": "Maximum of Three",
        "description_en": (
            "Write a program that reads three integers and outputs the maximum value.\n\n"
            "**Instructions:**\n"
            "1. Read three integers `a`, `b`, and `c` from the input.\n"
            "2. Compare them using `if-elif-else` conditionals.\n"
            "3. Output the maximum value."
        ),
        "description_id": (
            "Tulis program yang membaca tiga integer dan menampilkan nilai terbesar.\n\n"
            "**Instruksi:**\n"
            "1. Baca tiga integer `a`, `b`, dan `c` dari input.\n"
            "2. Bandingkan mereka menggunakan conditional `if-elif-else`.\n"
            "3. Tampilkan nilai terbesarnya."
        ),
        "starter_code": (
            "program MaxThree\n"
            "dictionary\n"
            "    a, b, c, max_val : integer\n"
            "algorithm\n"
            "    read a\n"
            "    read b\n"
            "    read c\n"
            "    \n"
            "    // Find the max_val using conditionals here:\n"
            "    \n"
            "    \n"
            "    write max_val\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "10\n20\n15\n", "expected": "20"},
            {"input": "5\n2\n9\n", "expected": "9"},
            {"input": "-3\n-7\n-5\n", "expected": "-3"}
        ]
    },
    "sum-n": {
        "title": "Sum of N Numbers",
        "description_en": (
            "Write a program that reads an integer `n` and computes the sum of all numbers from `1` to `n` using a loop and an accumulator variable `total`.\n\n"
            "**Instructions:**\n"
            "1. Read the integer `n` from the input.\n"
            "2. Initialize a variable `total` to `0`.\n"
            "3. Use a loop to iterate `i` from `1` to `n`, adding `i` to `total` at each step.\n"
            "4. Output the value of `total`."
        ),
        "description_id": (
            "Tulis program yang membaca sebuah integer `n` dan menghitung jumlah semua angka dari `1` sampai `n` menggunakan loop dan variabel akumulator `total`.\n\n"
            "**Instruksi:**\n"
            "1. Baca integer `n` dari input.\n"
            "2. Inisialisasi variabel `total` ke `0`.\n"
            "3. Gunakan loop untuk iterasi `i` dari `1` sampai `n`, tambahkan `i` ke `total` di setiap langkah.\n"
            "4. Tampilkan nilai dari `total`."
        ),
        "starter_code": (
            "program SumN\n"
            "dictionary\n"
            "    n, total, i : integer\n"
            "algorithm\n"
            "    read n\n"
            "    total <- 0\n"
            "    i <- 1\n"
            "    \n"
            "    // Write a loop here to compute the sum:\n"
            "    \n"
            "    \n"
            "    write total\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "5\n", "expected": "15"},
            {"input": "10\n", "expected": "55"}
        ]
    },
    "sum-evens": {
        "title": "Sum of Evens",
        "description_en": (
            "Write a program that reads an integer `n` and calculates the sum of all even numbers from `1` to `n`.\n\n"
            "**Instructions:**\n"
            "1. Read the integer `n` from the input.\n"
            "2. Initialize `sum` to `0`.\n"
            "3. Use a loop to iterate `i` from `1` to `n`.\n"
            "4. Inside the loop, check if `i` is even (`i % 2 == 0`) and if so, add it to `sum`.\n"
            "5. Output the final value of `sum`."
        ),
        "description_id": (
            "Tulis program yang membaca sebuah integer `n` dan menghitung jumlah semua bilangan genap dari `1` sampai `n`.\n\n"
            "**Instruksi:**\n"
            "1. Baca integer `n` dari input.\n"
            "2. Inisialisasi `sum` ke `0`.\n"
            "3. Gunakan loop untuk iterasi `i` dari `1` sampai `n`.\n"
            "4. Di dalam loop, periksa apakah `i` genap (`i % 2 == 0`) dan jika ya, tambahkan ke `sum`.\n"
            "5. Tampilkan nilai akhir dari `sum`."
        ),
        "starter_code": (
            "program SumEvens\n"
            "dictionary\n"
            "    n, sum, i : integer\n"
            "algorithm\n"
            "    read n\n"
            "    sum <- 0\n"
            "    i <- 1\n"
            "    \n"
            "    // Write your loop and conditional check here:\n"
            "    \n"
            "    \n"
            "    write sum\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "6\n", "expected": "12"},
            {"input": "3\n", "expected": "2"}
        ]
    }
}

DEFAULT_HINT_QUIZZES = {
  'swap-variables': [
    {
      "type": "mc",
      "text": "If x <- 5 and y <- 10 initially, what are the values of x and y after running the following pseudocode?",
      "code": "temp <- x\nx <- y\ny <- temp",
      "options": [
        "x = 5, y = 10",
        "x = 10, y = 5",
        "x = 5, y = 5",
        "x = 10, y = 10"
      ],
      "answer": "B",
      "explanation": "A temp variable stores the initial value of x (5), then x takes y's value (10), and y takes temp's stored value (5). This swaps the two variables."
    },
    {
      "type": "sa",
      "text": "In DAP pseudocode, which character operator sequence is used to perform variable assignment (e.g., storing a value)?",
      "options": None,
      "answer": "<-",
      "explanation": "The arrow operator <- is used in DAP to assign values to variables."
    },
    {
      "type": "mc",
      "text": "Why do we need a temporary helper variable (temp) to swap the values of two variables x and y?",
      "options": [
        "To prevent losing the original value of x when we overwrite it with y.",
        "Because DAP pseudocode compiler requires at least 3 variables to run.",
        "To speed up the compilation and program execution time.",
        "To declare the temp variable as a global buffer."
      ],
      "answer": "A",
      "explanation": "If we assign x <- y directly without saving x's original value, we overwrite x and lose its value forever, preventing us from assigning it to y."
    }
  ],
  'factorial': [
    {
      "type": "mc",
      "text": "What will be the final value of fact if we execute the loop with input n = 4?",
      "code": "fact <- 1\ni <- 1\nwhile i <= n do\n    fact <- fact * i\n    i <- i + 1\nendwhile",
      "options": [
        "24",
        "12",
        "6",
        "1"
      ],
      "answer": "A",
      "explanation": "For n = 4, the loop multiplies fact by 1, 2, 3, and 4 sequentially: 1 * 1 * 2 * 3 * 4 = 24."
    },
    {
      "type": "sa",
      "text": "In the factorial algorithm, what is the initial value of the accumulator variable 'fact'?",
      "options": None,
      "answer": "1",
      "explanation": "The variable 'fact' is initialized to 1 because 1 is the multiplicative identity. Initializing to 0 would cause all subsequent multiplications to result in 0."
    },
    {
      "type": "mc",
      "text": "What type of loop is used in the provided factorial algorithm?",
      "options": [
        "while loop",
        "for loop",
        "repeat-until loop",
        "infinite loop"
      ],
      "answer": "A",
      "explanation": "The algorithm uses a 'while' loop block structure: 'while i <= n do ... endwhile'."
    }
  ],
  'circle-calc': [
    {
      "type": "mc",
      "text": "Which keyword is used to declare a constant value in DAP that cannot be modified?",
      "options": [
        "var",
        "define",
        "const",
        "constant"
      ],
      "answer": "C",
      "explanation": "The const keyword is used in DAP to declare constants."
    },
    {
      "type": "sa",
      "text": "If we declare const pi = 3.14, what happens when we try to assign pi <- 3.15 later in the algorithm?",
      "options": None,
      "answer": "error",
      "explanation": "Constants cannot be mutated or reassigned; doing so causes a compiler or parser error."
    }
  ],
  'even-odd': [
    {
      "type": "mc",
      "text": "Which operator is used to find the remainder of division of two integers in DAP?",
      "options": [
        "/",
        "div",
        "%",
        "rem"
      ],
      "answer": "C",
      "explanation": "The Modulo operator % returns the remainder of integer division."
    },
    {
      "type": "sa",
      "text": "What is the result of 15 % 4 in DAP?",
      "options": None,
      "answer": "3",
      "explanation": "15 divided by 4 is 3 with a remainder of 3. So 15 % 4 = 3."
    }
  ],
  'quadratic-eval': [
    {
      "type": "mc",
      "text": "What does the expression 2^3 compute to in DAP?",
      "options": [
        "6",
        "8",
        "9",
        "5"
      ],
      "answer": "B",
      "explanation": "The caret operator ^ is used for exponentiation, so 2^3 is 2 * 2 * 2 = 8."
    }
  ],
  'greeting-gen': [
    {
      "type": "mc",
      "text": "Which of the following statements can be used to output values to the screen in DAP?",
      "options": [
        "read",
        "input",
        "write",
        "get"
      ],
      "answer": "C",
      "explanation": "The write/print statements are used to output values in DAP."
    }
  ],
  'max-three': [
    {
      "type": "mc",
      "text": "Which block structure is used to implement selection or branch logic based on boolean conditions in DAP?",
      "options": [
        "while-endwhile",
        "for-endfor",
        "if-endif",
        "repeat-until"
      ],
      "answer": "C",
      "explanation": "The if-endif statement implements conditional branching."
    }
  ],
  'sum-n': [
    {
      "type": "mc",
      "text": "Which variable acts as the accumulator to accumulate the sum of numbers in the Sum of N algorithm?",
      "options": [
        "n",
        "total",
        "i",
        "temp"
      ],
      "answer": "B",
      "explanation": "The total variable accumulates the sum of numbers (total <- total + i) during loop iterations."
    }
  ],
  'sum-evens': [
    {
      "type": "mc",
      "text": "How do we check if an integer 'i' is even inside our loop structure in DAP?",
      "options": [
        "if i div 2 == 0",
        "if i % 2 == 0",
        "if i / 2 == 0",
        "if i % 2 != 0"
      ],
      "answer": "B",
      "explanation": "We use the modulo operator % to check if the remainder of division by 2 is zero."
    }
  ]
}

# Align connection URL to asyncpg
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

async def seed_demo(reset: bool = False):
    engine = create_async_engine(db_url, echo=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        print(f"Starting demo database seeding (reset={reset})...")

        if reset:
            print("Reset flag provided. Cleaning up existing demo data...")
            # Delete weekly targets for the demo course
            await session.execute(
                delete(WeeklyTarget).where(WeeklyTarget.course_ref == "CS1-PYTHON-2026")
            )
            # Delete demo student users
            demo_usernames = [
                "demo_student_1", "demo_student_2", "demo_student_3",
                "student_user", "instructor_user", "researcher_user", "rater_user"
            ]
            
            # Fetch user IDs to clean up related tables
            user_stmt = select(User.id).where(User.username.in_(demo_usernames))
            user_ids_res = await session.execute(user_stmt)
            user_ids = user_ids_res.scalars().all()
            
            if user_ids:
                await session.execute(delete(QuizProgress).where(QuizProgress.user_id.in_(user_ids)))
                await session.execute(delete(Attempt).where(Attempt.user_id.in_(user_ids)))
                await session.execute(delete(StudentModelState).where(StudentModelState.user_id.in_(user_ids)))
                
            await session.execute(
                delete(User).where(User.username.in_(demo_usernames))
            )
            # Delete seeded problems
            await session.execute(
                delete(Problem).where(Problem.key.in_(list(DEFAULT_PROBLEMS.keys())))
            )
            # Delete hint quizzes
            await session.execute(
                delete(HintQuizQuestion)
            )
            await session.commit()
            print("Cleanup completed.")

        # 1. Seed Demo Students and Stub Users
        demo_students = [
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111111"),
                "username": "student_user",
                "email": "student@example.com",
                "password": "studentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
                "username": "instructor_user",
                "email": "instructor@example.com",
                "password": "instructorpass",
                "role": "instructor",
                "consent_status": True
            },
            {
                "id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
                "username": "researcher_user",
                "email": "researcher@example.com",
                "password": "researcherpass",
                "role": "researcher",
                "consent_status": True
            },
            {
                "id": uuid.UUID("44444444-4444-4444-4444-444444444444"),
                "username": "rater_user",
                "email": "rater@example.com",
                "password": "raterpass",
                "role": "rater",
                "consent_status": True
            },
            {
                "username": "demo_student_1",
                "email": "student1@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "username": "demo_student_2",
                "email": "student2@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "username": "demo_student_3",
                "email": "student3@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            }
        ]

        for student_data in demo_students:
            # Check if user already exists
            stmt = select(User).where(User.username == student_data["username"])
            result = await session.execute(stmt)
            existing_user = result.scalar_one_or_none()

            if not existing_user:
                db_user = User(
                    id=student_data.get("id") or uuid.uuid4(),
                    username=student_data["username"],
                    hashed_password=get_password_hash(student_data["password"]),
                    role=student_data["role"],
                    consent_status=student_data["consent_status"]
                )
                session.add(db_user)
                print(f"Seeded student: {student_data['username']}")
            else:
                print(f"Student already exists: {student_data['username']}")

        # 2. Seed WeeklyTargets tied to the demo course
        targets_to_seed = [
            {
                "week": 1,
                "topic_kc_focus": "VA",
                "title": "Variable Swapping",
                "description": (
                    "Write a program that swaps the values of two variables, x and y.\n\n"
                    "Instructions:\n"
                    "1. Read x and y from standard input.\n"
                    "2. Swap their values (use temp as helper).\n"
                    "3. Write the value of x, then write y."
                ),
                "target_task": (
                    "Write a program that swaps the values of two variables, x and y.\n\n"
                    "Instructions:\n"
                    "1. Read x and y from standard input.\n"
                    "2. Swap their values (use temp as helper).\n"
                    "3. Write the value of x, then write y."
                ),
                "deadline": datetime(2026, 6, 28, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 2,
                "topic_kc_focus": "LO",
                "title": "Factorial Calculator",
                "description": (
                    "Write a program that computes the factorial of n (n!).\n\n"
                    "Instructions:\n"
                    "1. Read n from standard input.\n"
                    "2. Loop to calculate the factorial, storing it in fact.\n"
                    "3. Write the value of fact."
                ),
                "target_task": (
                    "Write a program that computes the factorial of n (n!).\n\n"
                    "Instructions:\n"
                    "1. Read n from standard input.\n"
                    "2. Loop to calculate the factorial, storing it in fact.\n"
                    "3. Write the value of fact."
                ),
                "deadline": datetime(2026, 7, 5, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 3,
                "topic_kc_focus": "CO",
                "title": "Circle Calculator",
                "description": (
                    "Write a program that reads the radius r of a circle and calculates its area and circumference using the constant pi = 3.14159."
                ),
                "target_task": (
                    "Write a program that reads the radius r of a circle and calculates its area and circumference using the constant pi = 3.14159."
                ),
                "deadline": datetime(2026, 7, 12, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 4,
                "topic_kc_focus": "OP",
                "title": "Even Odd Checker",
                "description": (
                    "Write a program that reads an integer n and checks if it is even or odd using the modulo operator %."
                ),
                "target_task": (
                    "Write a program that reads an integer n and checks if it is even or odd using the modulo operator %."
                ),
                "deadline": datetime(2026, 7, 19, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 5,
                "topic_kc_focus": "EX",
                "title": "Quadratic Evaluator",
                "description": (
                    "Write a program that evaluates the expression y = 3*x^2 + 5*x - 2 for a given integer x."
                ),
                "target_task": (
                    "Write a program that evaluates the expression y = 3*x^2 + 5*x - 2 for a given integer x."
                ),
                "deadline": datetime(2026, 7, 26, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 6,
                "topic_kc_focus": "IO",
                "title": "Greeting Generator",
                "description": (
                    "Write a program that reads a user's name and age, and prints a greeting message."
                ),
                "target_task": (
                    "Write a program that reads a user's name and age, and prints a greeting message."
                ),
                "deadline": datetime(2026, 8, 2, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 7,
                "topic_kc_focus": "CD",
                "title": "Maximum of Three",
                "description": (
                    "Write a program that reads three integers and outputs the maximum value using if-elif-else."
                ),
                "target_task": (
                    "Write a program that reads three integers and outputs the maximum value using if-elif-else."
                ),
                "deadline": datetime(2026, 8, 9, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 8,
                "topic_kc_focus": "LO, VA",
                "title": "Sum of N Numbers",
                "description": (
                    "Write a program that computes the sum of numbers from 1 to n using a loop and total variable."
                ),
                "target_task": (
                    "Write a program that computes the sum of numbers from 1 to n using a loop and total variable."
                ),
                "deadline": datetime(2026, 8, 16, 23, 59, 0),
                "source": "manual"
            },
            {
                "week": 9,
                "topic_kc_focus": "CD, LO, EX",
                "title": "Sum of Evens",
                "description": (
                    "Write a program that calculates the sum of all even numbers from 1 to n."
                ),
                "target_task": (
                    "Write a program that calculates the sum of all even numbers from 1 to n."
                ),
                "deadline": datetime(2026, 8, 23, 23, 59, 0),
                "source": "manual"
            }
        ]

        for target_data in targets_to_seed:
            stmt = select(WeeklyTarget).where(
                WeeklyTarget.course_ref == "CS1-PYTHON-2026",
                WeeklyTarget.week == target_data["week"]
            )
            result = await session.execute(stmt)
            existing_target = result.scalar_one_or_none()

            if not existing_target:
                db_target = WeeklyTarget(
                    id=uuid.uuid4(),
                    course_ref="CS1-PYTHON-2026",
                    week=target_data["week"],
                    topic_kc_focus=target_data["topic_kc_focus"],
                    target_task=target_data["target_task"],
                    source=target_data["source"],
                    title=target_data["title"],
                    description=target_data["description"],
                    deadline=target_data["deadline"]
                )
                session.add(db_target)
                print(f"Seeded WeeklyTarget for course CS1-PYTHON-2026 week {target_data['week']}")
            else:
                existing_target.target_task = target_data["target_task"]
                existing_target.topic_kc_focus = target_data["topic_kc_focus"]
                existing_target.title = target_data["title"]
                existing_target.description = target_data["description"]
                existing_target.deadline = target_data["deadline"]
                print(f"WeeklyTarget for course CS1-PYTHON-2026 week {target_data['week']} updated")

        # 3. Seed Predefined Problems
        for key, prob_data in DEFAULT_PROBLEMS.items():
            stmt = select(Problem).where(Problem.key == key)
            result = await session.execute(stmt)
            existing_prob = result.scalar_one_or_none()

            if not existing_prob:
                db_prob = Problem(
                    id=uuid.uuid4(),
                    key=key,
                    title=prob_data["title"],
                    description_en=prob_data["description_en"],
                    description_id=prob_data["description_id"],
                    starter_code=prob_data["starter_code"],
                    test_cases=prob_data["test_cases"]
                )
                session.add(db_prob)
                print(f"Seeded problem: {key}")
            else:
                existing_prob.title = prob_data["title"]
                existing_prob.description_en = prob_data["description_en"]
                existing_prob.description_id = prob_data["description_id"]
                existing_prob.starter_code = prob_data["starter_code"]
                existing_prob.test_cases = prob_data["test_cases"]
                print(f"Problem updated: {key}")

        # 4. Seed Hint Quizzes
        for problem_key, questions in DEFAULT_HINT_QUIZZES.items():
            for q_data in questions:
                stmt = select(HintQuizQuestion).where(
                    HintQuizQuestion.problem_key == problem_key,
                    HintQuizQuestion.text == q_data["text"]
                )
                result = await session.execute(stmt)
                existing_q = result.scalar_one_or_none()

                if not existing_q:
                    db_q = HintQuizQuestion(
                        id=uuid.uuid4(),
                        problem_key=problem_key,
                        type=q_data["type"],
                        text=q_data["text"],
                        code=q_data.get("code"),
                        options=q_data.get("options"),
                        answer=q_data["answer"],
                        explanation=q_data["explanation"]
                    )
                    session.add(db_q)
                    print(f"Seeded HintQuizQuestion for {problem_key}")
                else:
                    print(f"HintQuizQuestion for {problem_key} already exists")

        await session.commit()
        print("Demo database seeding completed successfully!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database with demo data.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset and delete demo data before seeding"
    )
    args = parser.parse_args()
    asyncio.run(seed_demo(reset=args.reset))
