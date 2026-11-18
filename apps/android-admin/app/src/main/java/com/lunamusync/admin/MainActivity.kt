package com.lunamusync.admin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LunaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val model: AdminViewModel = viewModel()
                    if (model.authenticated) AdminScreen(model) else LoginScreen(model)
                }
            }
        }
    }
}
