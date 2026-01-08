document.addEventListener("DOMContentLoaded", function () {
    const API_URL = "http://172.29.19.20:33003";

    const loginCard = document.querySelector(".login-card");
    const registerCard = document.querySelector(".register-card");
    const showRegister = document.getElementById("showRegister");
    const showLogin = document.getElementById("showLogin");

    function updateView() {
        if (window.location.hash === "#register") {
            loginCard.style.display = "none";
            registerCard.style.display = "block";
        } else {
            registerCard.style.display = "none";
            loginCard.style.display = "block";
        }
    }

    showRegister.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.hash = "#register";
        updateView();
    });

    showLogin.addEventListener("click", function (event) {
        event.preventDefault();
        window.location.hash = "#login";
        updateView();
    });

    window.addEventListener("hashchange", updateView);
    updateView();

    document.getElementById("registerForm").addEventListener("submit", function (event) {
        event.preventDefault();
        const username = document.getElementById("newUsername").value;
        const password = document.getElementById("newPassword").value;

        fetch(`${API_URL}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert("Compte créé avec succès !");
                window.location.hash = "#login";
                updateView();
            } else {
                document.getElementById("register-error-message").textContent = data.message;
            }
        })
        .catch(error => {
            console.error("Erreur lors de l'inscription :", error);
            document.getElementById("register-error-message").textContent = "Une erreur est survenue.";
        });
    });

document.getElementById("loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem("token", data.token);
            localStorage.setItem("role", data.role); 
            localStorage.setItem("userId", data.userId); 
            localStorage.setItem("username", username);

            window.location.href = "dashboard.html";
        } else {
            document.getElementById("error-message").textContent = data.message;
        }
    })
    
    .catch(error => {
        console.error("Erreur lors de la connexion :", error);
        document.getElementById("error-message").textContent = "Une erreur est survenue.";
        });
    });
});
