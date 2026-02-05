plugins {
    id("java")
    id("com.github.johnrengelman.shadow") version "8.1.1"
    id("application")
}

group = "com.truesight"
version = "1.0.0"

// Use local JDK instead of toolchain auto-detection
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

// Configure compiler options
tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-Xlint:none")
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("com.skadistats:clarity:3.1.3")
    implementation("com.skadistats:clarity-protobuf:5.4")
    implementation("org.xerial.snappy:snappy-java:1.1.10.5")
    implementation("org.slf4j:slf4j-api:2.0.7")
    implementation("org.slf4j:slf4j-simple:2.0.7")
    implementation("com.google.code.gson:gson:2.10.1")
}

application {
    mainClass.set("SimpleDemoParser")
}

tasks.shadowJar {
    archiveBaseName.set("clarity-parser")
    archiveClassifier.set("uber")
    archiveVersion.set("1.0.0")
    
    manifest {
        attributes["Main-Class"] = "SimpleDemoParser"
    }
    
    // Merge service files
    mergeServiceFiles()
}

tasks.build {
    dependsOn(tasks.shadowJar)
}
