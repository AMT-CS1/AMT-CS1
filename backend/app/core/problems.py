# Predefined coding exercises and test cases for student pseudocode (DAP) submissions.

PROBLEMS = {
    "swap-variables": {
        "title": "Variable Swapping",
        "description": (
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
        "description": (
            "Write a program that reads a non-negative integer `n` and computes its factorial (n!).\n\n"
            "**Instructions:**\n"
            "1. Read the value of `n` from the input.\n"
            "2. Compute `n * (n-1) * ... * 1` and store it in `fact`.\n"
            "3. If `n` is `0`, the factorial is defined as `1`.\n"
            "4. Output the final value of `fact`.\n\n"
            "**Example:**\n"
            "If the input is `5`, the output must be `120`."
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
    }
}
